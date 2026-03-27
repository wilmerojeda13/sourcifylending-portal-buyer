/**
 * SourcifyLending Voice Agent — WebSocket Server
 * ================================================
 * Standalone Node.js server that bridges Twilio Media Streams
 * with the Google Gemini Live API for real-time AI voice calls.
 *
 * Run:  node server.mjs
 * Port: configured via PORT env (Railway sets this automatically)
 *
 * Dependencies: ws, @supabase/supabase-js
 */
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { createClient } from '@supabase/supabase-js'
import { getAvailableSlots, createCalendarEvent } from './calendar.mjs'

// ─── Config ────────────────────────────────────────────────────
const PORT                = parseInt(process.env.PORT ?? process.env.VOICE_SERVER_PORT ?? '3002')
const GEMINI_API_KEY      = process.env.GEMINI_API_KEY             ?? ''
const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL   ?? ''
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? ''
const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID         ?? ''
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN          ?? ''
const TWILIO_FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER         ?? ''  // E.164 number to send SMS from
const GEMINI_MODEL        = 'models/gemini-3.1-flash-live-preview' // Live model available on this key
const GEMINI_API_VER      = 'v1beta'                               // v1beta for Live API (BidiGenerateContent)
const VOICE_NAME          = 'Aoede'  // Female voice — professional and natural
const MAX_CALL_SECONDS    = 120

if (!GEMINI_API_KEY) console.warn('[VOICE SERVER] WARNING: GEMINI_API_KEY not set')
if (!SUPABASE_URL || !SUPABASE_KEY) console.warn('[VOICE SERVER] WARNING: Supabase env not set')
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
  console.warn('[VOICE SERVER] WARNING: Twilio SMS env not set — analyzer links will NOT be texted')
}

// ─── Twilio SMS helper ─────────────────────────────────────────
async function sendSms(toNumber, body) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return false
  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: TWILIO_FROM_NUMBER, To: toNumber, Body: body }).toString(),
      }
    )
    const json = await res.json()
    if (json.error_code) { console.error('[SMS] Send failed:', json.message); return false }
    console.log('[SMS] Sent to', toNumber, '| sid:', json.sid)
    return true
  } catch (e) {
    console.error('[SMS] Error:', e.message)
    return false
  }
}

// ─── Supabase client (service role) ────────────────────────────
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

// ─── Config: VAD / silence detection ───────────────────────────
// Twilio PSTN line noise is typically 100-500 RMS; real speech is 2000+
const SPEECH_RMS_THRESHOLD = 1800  // RMS above this = user is speaking
const SILENCE_END_MS       = 700   // ms of silence after speech → end of turn

// ─── Audio conversion utilities ────────────────────────────────
// µ-law decode table
const MULAW_DECODE = new Int16Array(256)
for (let i = 0; i < 256; i++) {
  let u = ~i
  const sign = u & 0x80
  const exp  = (u >> 4) & 0x07
  const mant = u & 0x0F
  let s = ((mant << 3) + 0x84) << exp
  s -= 0x84
  MULAW_DECODE[i] = sign ? -s : s
}

function mulawToLinear16(mu) { return MULAW_DECODE[mu & 0xFF] }

/** Compute RMS energy of a base64-encoded mulaw buffer (for speech detection) */
function mulawRms(base64Mulaw) {
  const buf = Buffer.from(base64Mulaw, 'base64')
  let sum = 0
  for (let i = 0; i < buf.length; i++) {
    const s = mulawToLinear16(buf[i])
    sum += s * s
  }
  return Math.sqrt(sum / buf.length)
}

function linear16ToMulaw(sample) {
  const BIAS = 0x84, CLIP = 32635
  let sign = 0
  if (sample < 0) { sign = 0x80; sample = -sample }
  if (sample > CLIP) sample = CLIP
  sample += BIAS
  let exp = 7
  for (let m = 0x4000; (sample & m) === 0 && exp > 0; exp--, m >>= 1) {}
  const mantissa = (sample >> (exp + 3)) & 0x0F
  return (~(sign | (exp << 4) | mantissa)) & 0xFF
}

/** Twilio mulaw base64 (8kHz) → PCM base64 (16kHz) for Gemini */
function twilioToGeminiAudio(base64Mulaw) {
  const mulawBuf = Buffer.from(base64Mulaw, 'base64')
  // mulaw → linear16 → upsample 8k→16k
  const pcm16k = new Int16Array(mulawBuf.length * 2)
  for (let i = 0; i < mulawBuf.length; i++) {
    const s = mulawToLinear16(mulawBuf[i])
    pcm16k[i * 2]     = s
    pcm16k[i * 2 + 1] = i < mulawBuf.length - 1
      ? Math.round((s + mulawToLinear16(mulawBuf[i + 1])) / 2)
      : s
  }
  const pcmBuf = Buffer.from(pcm16k.buffer)
  return pcmBuf.toString('base64')
}

/** Gemini PCM base64 (24kHz) → Twilio mulaw base64 (8kHz) */
function geminiToTwilioAudio(base64Pcm) {
  const pcmBuf = Buffer.from(base64Pcm, 'base64')
  const pcm24k = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, pcmBuf.byteLength / 2)
  // downsample 24k → 8k (every 3rd sample)
  const len    = Math.floor(pcm24k.length / 3)
  const mulaw  = Buffer.allocUnsafe(len)
  for (let i = 0; i < len; i++) {
    mulaw[i] = linear16ToMulaw(pcm24k[i * 3])
  }
  return mulaw.toString('base64')
}

// ─── Opt-out detection ─────────────────────────────────────────
const OPT_OUT_PHRASES = [
  // English
  'stop', 'remove me', 'remove us', 'do not call', "don't call",
  'dont call', 'not interested permanently', 'never call', 'take me off',
  'unsubscribe', 'stop calling', 'put me on the do not call list',
  // Spanish
  'no me llames', 'no llames', 'quítame de la lista', 'no me interesa',
  'bórrame', 'elimíname', 'no vuelvas a llamar', 'no quiero que llamen',
  'ponme en la lista de no llamar', 'no llamar', 'deja de llamar',
]

function detectOptOut(text) {
  const lower = text.toLowerCase()
  return OPT_OUT_PHRASES.some(p => lower.includes(p))
}

// ─── Language detection ─────────────────────────────────────────
const LANGUAGE_MARKERS = {
  spanish: ['[LANGUAGE:spanish]', '[IDIOMA:español]', '[LANGUAGE:es]'],
  french:  ['[LANGUAGE:french]',  '[LANGUAGE:fr]'],
  portuguese: ['[LANGUAGE:portuguese]', '[LANGUAGE:pt]'],
  mandarin:   ['[LANGUAGE:mandarin]',   '[LANGUAGE:zh]'],
  hindi:      ['[LANGUAGE:hindi]',      '[LANGUAGE:hi]'],
}

function detectLanguageSwitch(text) {
  const lower = text.toLowerCase()
  for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
    if (markers.some(m => lower.includes(m.toLowerCase()))) return lang
  }
  return null
}

function detectDisposition(text) {
  // Check for structured marker: [DISPOSITION:code]
  const m = text.match(/\[DISPOSITION:(\w+)\]/)
  if (m) return m[1]

  const lower = text.toLowerCase()
  if (lower.includes('transferred_live') || (lower.includes('transfer') && lower.includes('connect'))) return 'transferred_live'
  if (lower.includes('send_link') || lower.includes('sending the link') || lower.includes('send you the link')) return 'send_link'
  if (lower.includes('callback_requested') || lower.includes('call you back') || lower.includes('schedule a callback')) return 'callback_requested'
  if (lower.includes('do_not_call') || lower.includes('remove you from')) return 'do_not_call'
  if (lower.includes('voicemail') || lower.includes('voice mail') || lower.includes('leave a message')) return 'voicemail'
  if (lower.includes('wrong number') || lower.includes('wrong_number')) return 'wrong_number'
  if (lower.includes('not interested') || lower.includes('not_interested')) return 'not_interested'
  if (lower.includes('decision_maker')) return 'decision_maker'
  if (lower.includes('gatekeeper')) return 'gatekeeper'
  return null
}

function extractSummary(text) {
  const m = text.match(/\[SUMMARY:([^\]]+)\]/)
  return m ? m[1].trim() : null
}

// ─── Personalized opener builder ───────────────────────────────
function buildPersonalizedOpener(lead, settings) {
  const ownerName   = lead?.owner_name    || ''
  const business    = lead?.business_name || ''
  const isWarm      = !!(lead?.prior_inquiry_flag || lead?.prior_facebook_flag || lead?.prior_portal_flag || lead?.prior_analyzer_flag)

  const firstName   = ownerName.trim().split(/\s+/)[0] || ''
  // Clean business name: remove trailing LLC/Inc punctuation oddities
  const cleanBiz    = business.replace(/[,.]?\s*(LLC|Inc|Corp|Co|Ltd)\.?\s*$/i, '').trim()

  let opener
  if (isWarm && firstName && cleanBiz) {
    opener = `Hi, is this ${firstName}? It's SourcifyLending — you had shown interest before in funding options for ${cleanBiz}, and I just wanted to circle back to see if that's still something you're working on.`
  } else if (isWarm && firstName) {
    opener = `Hi, is this ${firstName}? It's SourcifyLending — you had shown some interest in funding options before. I just wanted to follow up to see where things stand.`
  } else if (!isWarm && firstName && cleanBiz) {
    opener = `Hi, is this ${firstName}? This is SourcifyLending. I'm reaching out regarding ${cleanBiz} to see who handles business funding or credit strategy for the company.`
  } else if (!isWarm && firstName) {
    opener = `Hi, is this ${firstName}? This is SourcifyLending. I was reaching out to see if you're the one handling business funding for the company.`
  } else if (cleanBiz) {
    opener = `Hi, this is SourcifyLending. I'm calling regarding ${cleanBiz}. Who handles business funding or credit strategy there?`
  } else {
    opener = `Hi, this is SourcifyLending. I'm reaching out to see who handles business funding or business credit strategy for the company.`
  }

  console.log('[PERSONALIZE] Generated opener:', opener.slice(0, 100))
  return opener
}

// ─── Gemini Live session ────────────────────────────────────────
async function createGeminiSession(systemPrompt, onAudio, onText, onToolCall, onClose) {
  if (!GEMINI_API_KEY) {
    console.warn('[GEMINI] No API key — audio passthrough only')
    return null
  }

  // Use WebSocket directly (no SDK dependency for Live API)
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${GEMINI_API_VER}.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`
  console.log('[GEMINI] Connecting to Live API...')

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let setupSent = false
    let resolved  = false
    let closed    = false

    ws.on('open', () => {
      console.log('[GEMINI] WebSocket opened — sending setup')
      // Send setup message.
      // Disable automatic VAD so we control turn boundaries manually via activityEnd.
      // This lets us trigger the opening line immediately after setup completes.
      const setup = {
        setup: {
          model: GEMINI_MODEL,
          generation_config: {
            response_modalities: ['AUDIO', 'TEXT'],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: VOICE_NAME }
              }
            }
          },
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          tools: [{
            functionDeclarations: [
              {
                name: 'check_availability',
                description: 'Check Abel\'s Google Calendar for available demo slots. Call this when a qualified lead agrees to book a demo.',
                parameters: {
                  type: 'object',
                  properties: {
                    num_slots: { type: 'integer', description: 'Number of slots to return, usually 2 or 3' }
                  }
                }
              },
              {
                name: 'book_appointment',
                description: 'Book a demo appointment on the calendar. Call this after the lead has selected a time slot.',
                parameters: {
                  type: 'object',
                  properties: {
                    slot_index:    { type: 'integer', description: 'The index of the chosen slot from check_availability (0, 1, or 2)' },
                    lead_email:    { type: 'string',  description: 'Lead\'s email address for the calendar invite' },
                    lead_name:     { type: 'string',  description: 'Lead\'s full name' },
                    business_name: { type: 'string',  description: 'Lead\'s business name' }
                  },
                  required: ['slot_index', 'lead_name']
                }
              },
              {
                name: 'send_analyzer_link',
                description: 'Log that the free analyzer link should be sent to this lead. Call this when the lead wants info first or booking is not possible.',
                parameters: {
                  type: 'object',
                  properties: {
                    reason: { type: 'string', description: 'Why the analyzer link is being sent: warm_lead, no_booking, fallback' }
                  }
                }
              },
              {
                name: 'log_qualification',
                description: 'Log the lead\'s qualification classification.',
                parameters: {
                  type: 'object',
                  properties: {
                    classification: { type: 'string', description: 'hot, warm, or cold' },
                    notes:          { type: 'string', description: 'Brief qualification summary' }
                  },
                  required: ['classification']
                }
              }
            ]
          }]
        }
      }
      ws.send(JSON.stringify(setup))
      setupSent = true
    })

    ws.on('message', (data) => {
      try {
        const raw = data.toString()
        const msg = JSON.parse(raw)

        // Log all non-audio messages for debugging
        if (!resolved || msg.error || msg.serverContent?.turnComplete) {
          console.log('[GEMINI] Message:', raw.slice(0, 400))
        }

        // Setup complete
        if (msg.setupComplete) {
          console.log('[GEMINI] Setup complete — session ready')
          resolved = true
          resolve({
            // Send audio to Gemini (Twilio mulaw→PCM already converted by caller)
            send: (audioBase64) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  realtimeInput: {
                    audio: {
                      data: audioBase64,
                      mimeType: 'audio/pcm;rate=16000',
                    }
                  }
                }))
              }
            },
            triggerOpening: () => {
              if (ws.readyState !== WebSocket.OPEN) return
              console.log('[GEMINI] Triggering opening via clientContent')
              ws.send(JSON.stringify({
                clientContent: {
                  turns: [{ role: 'user', parts: [{ text: '.' }] }],
                  turnComplete: true
                }
              }))
            },
            close: () => {
              if (!closed) { closed = true; ws.close() }
            },
            sendToolResponse: (functionResponses) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  toolResponse: { functionResponses }
                }))
              }
            },
          })
        }

        // Model response — check both snake_case (v1alpha) and camelCase (v1beta)
        const parts = (msg.serverContent ?? msg.server_content)
          ?.modelTurn?.parts
          ?? (msg.serverContent ?? msg.server_content)
          ?.model_turn?.parts
        if (parts) {
          for (const part of parts) {
            // Audio — check both inline_data (snake) and inlineData (camel)
            const inlineData = part.inlineData ?? part.inline_data
            const mimeType   = inlineData?.mimeType ?? inlineData?.mime_type ?? ''
            if (inlineData?.data && mimeType.startsWith('audio/')) {
              console.log('[GEMINI] Audio chunk → Twilio')
              onAudio(inlineData.data)
            }
            if (part.text) {
              onText(part.text)
            }
          }
        }

        // Turn complete
        const sc = msg.serverContent ?? msg.server_content
        if (sc?.turnComplete || sc?.turn_complete) {
          console.log('[GEMINI] Turn complete')
        }

        // Tool calls
        const toolCall = msg.toolCall ?? msg.tool_call
        const fnCalls  = toolCall?.functionCalls ?? toolCall?.function_calls
        if (fnCalls?.length) {
          console.log('[GEMINI] Tool call:', fnCalls.map(f => f.name).join(', '))
          onToolCall(fnCalls)
        }
      } catch (e) {
        console.error('[GEMINI] Message parse error:', e.message)
      }
    })

    ws.on('error', (err) => {
      console.error('[GEMINI] WebSocket error:', err.message)
      if (!resolved) reject(err)
    })

    ws.on('close', (code, reason) => {
      const reasonStr = reason?.toString() || ''
      console.error(`[GEMINI] WebSocket closed: code=${code}, reason="${reasonStr}"`)
      closed = true
      if (!resolved) {
        reject(new Error(`Gemini closed before setupComplete: code=${code} reason="${reasonStr}"`))
      }
      onClose()
    })

    // Timeout for setup
    setTimeout(() => {
      if (!resolved) reject(new Error('Gemini setup timeout (10s)'))
    }, 10000)
  })
}

// ─── Load system prompt from DB ────────────────────────────────
async function loadSystemPrompt(leadId, callId) {
  try {
    let lead     = null
    let settings = null

    if (supabase) {
      const [leadRes, settingsRes] = await Promise.all([
        leadId ? supabase.from('voice_leads').select('*').eq('id', leadId).single() : Promise.resolve({ data: null }),
        supabase.from('voice_agent_settings').select('*').eq('id', 'default').single(),
      ])
      lead     = leadRes.data
      settings = settingsRes.data
    }

    const opener = buildPersonalizedOpener(lead, settings)

    // Log the opener for QA
    if (callId && supabase) {
      supabase.from('voice_calls').update({ generated_opener: opener }).eq('id', callId).catch(() => {})
    }

    const analyzerUrl      = settings?.analyzer_url      ?? process.env.ANALYZER_URL ?? 'https://app.sourcifylending.com/analyzer'
    const transferNum      = settings?.transfer_number   ?? ''
    const calendarEnabled  = !!(settings?.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN)

    return buildSystemPrompt(opener, analyzerUrl, transferNum, calendarEnabled)
  } catch (err) {
    console.error('[VOICE SERVER] Error loading prompt:', err.message)
    return buildSystemPrompt(
      "Hi, this is SourcifyLending. I'm reaching out to see who handles business funding or business credit strategy for the company.",
      'https://app.sourcifylending.com/analyzer',
      '',
      false
    )
  }
}

function buildSystemPrompt(opener, analyzerUrl, transferNum, calendarEnabled) {
  return `LANGUAGE — NON-NEGOTIABLE: You MUST speak English. Your opening word is English. Every sentence is English. Even if the person's name sounds Spanish or Latino — you still open in English. The ONLY exception: if the person speaks to you first in another language, then match their language. If they respond in Spanish, switch fully to Spanish and output [LANGUAGE:spanish] on its own line.

You are Sarah, a business credit advisor at SourcifyLending. You're making an outbound call. You sound like a real person having a real conversation — not a bot reading a script. You're curious, relaxed, and direct. You don't ramble. You don't oversell. You ask one thing at a time and actually listen.

YOUR OPENING LINE — say this, then stop and wait:
"${opener}"

HOW THE CALL FLOWS:
Say the opener. Wait for them to respond. Then have a real back-and-forth conversation. Your job is to figure out if they're actually looking for funding or business credit — if so, get them booked or send them the analyzer link. If not, wrap it up quickly and politely.

You MUST go through this in order:
1. Confirm you're talking to the right person
2. Ask 2-3 qualifying questions — one at a time, naturally
3. ONLY after qualifying: if they're a fit, offer to book a demo or send the analyzer link
4. If they're not a fit, end the call respectfully

HARD RULE — DO NOT offer the analyzer link, do not call any tool, do not mention booking until you have asked at least 2 qualifying questions and heard their answers.

QUALIFYING QUESTIONS (pick naturally, one at a time):
- "Are you actively looking for funding right now, or more just exploring?"
- "Is this for an existing business?"
- "How long has the business been operating?"
- "Are you mainly looking at funding, business credit, or just seeing what's out there?"
- "Have you applied anywhere recently?"
- "Are you trying to move on this soon, or still in the looking phase?"

HOW TO SOUND HUMAN:
- Short responses. 1-2 sentences max.
- One question per turn. Never stack two questions.
- Use natural transitions: "got it", "yeah", "makes sense", "okay", "fair enough"
- If they give a short answer, follow up naturally before moving on
- Don't repeat what they said back to them word-for-word
- If they interrupt you, stop talking immediately

LEAD TYPES (internal — don't say these words):
HOT = actively seeking + existing business + decision maker + open to next step → try to book
WARM = interested but not ready → send analyzer link
COLD = not interested / gatekeeper / no business → exit gracefully

WHEN THEY OBJECT:
- Busy: "Got it. Quick question before I let you go — are you actively looking for funding, or should I just send you the link?"
- Not interested: "No worries at all. Thanks for your time."
- What is this: "We work with business owners on funding readiness and credit options. I was calling to see if it's something you're actively working on."
- Already have someone: "Got it — are you still comparing options or pretty locked in?"
- Send info: "Sure thing. I can send you the free analyzer link — takes a couple minutes and shows exactly where you stand."

${calendarEnabled ? `BOOKING A DEMO (only when they're clearly a fit and open to it):
- "Based on what you've shared, I'd love to get you in for a quick demo. Let me check a couple openings — want me to do that?"
- If yes → call check_availability tool
- Present slots casually: "I've got [slot 1] or [slot 2]. Which works better?"
- When they pick → call book_appointment tool with their name, email, and chosen slot
- Confirm: "Perfect, you're down for [time]. You'll get a confirmation."` : `BOOKING: Calendar not configured. If they're a fit, send the analyzer link instead.`}

ANALYZER LINK:
- Only offer this after you've qualified them (at least 2 questions asked and answered)
- Say: "I can send you the free analyzer link — it just takes a couple minutes and shows where you stand on funding eligibility."
- Then call send_analyzer_link tool
- After calling the tool, say: "I'll have that sent over to you after our call."

STRICT:
- Never fabricate prior interest unless it was in the lead record
- Never say "loan", "guaranteed", "approved"
- Never give long explanations
- At the very end of the call output on its own line: [DISPOSITION:code] [SUMMARY:one sentence]

Valid disposition codes: demo_booked, decision_maker, gatekeeper, voicemail, no_answer, bad_number, wrong_number, business_closed, personal_line, not_interested, do_not_call, send_link, callback_requested, interested, transferred_live`
}

// ─── Call session management ────────────────────────────────────
class CallSession {
  constructor(ws, callId, leadId, campaignId) {
    this.ws            = ws
    this.callId        = callId
    this.leadId        = leadId
    this.campaignId    = campaignId
    this.streamSid        = null
    this.geminiSession    = null
    this.textBuffer       = ''
    this.disposition      = null
    this.summary          = null
    this.detectedLang     = 'english'
    this.startTime        = Date.now()
    this.callTimer        = null
    this.silenceTimer     = null
    this.userSpeaking     = false
    this.closed           = false
    this.audioChunks      = 0
    this.availableSlots   = []    // cached slots from check_availability
    this.bookingData      = null  // set when booking is confirmed
    this.qualificationClass = null // hot/warm/cold
    this.calendarSettings = null  // loaded from DB
    this.leadPhone        = null  // E.164 phone for post-call SMS
    this.analyzerUrl      = null  // stored for post-call SMS
  }

  async initialize() {
    console.log(`[SESSION ${this.callId}] Initializing`)

    // Load calendar settings
    if (supabase) {
      const { data: settings } = await supabase.from('voice_agent_settings').select('*').eq('id', 'default').single()
      this.calendarSettings = settings || {}
    } else {
      this.calendarSettings = {}
    }
    // Merge env var overrides
    if (process.env.GOOGLE_REFRESH_TOKEN) this.calendarSettings.google_refresh_token = process.env.GOOGLE_REFRESH_TOKEN
    if (process.env.GOOGLE_CLIENT_ID)     this.calendarSettings.google_client_id     = process.env.GOOGLE_CLIENT_ID
    if (process.env.GOOGLE_CLIENT_SECRET) this.calendarSettings.google_client_secret = process.env.GOOGLE_CLIENT_SECRET
    if (process.env.GOOGLE_CALENDAR_ID)   this.calendarSettings.google_calendar_id   = process.env.GOOGLE_CALENDAR_ID

    // Load lead phone for post-call SMS
    if (this.leadId && supabase) {
      const { data: lead } = await supabase.from('voice_leads').select('phone_e164').eq('id', this.leadId).single()
      if (lead?.phone_e164) this.leadPhone = lead.phone_e164
    }

    // Store analyzer URL for post-call SMS
    const settingsData = this.calendarSettings
    this.analyzerUrl = settingsData?.analyzer_url ?? process.env.ANALYZER_URL ?? 'https://app.sourcifylending.com/analyzer'

    const systemPrompt = await loadSystemPrompt(this.leadId, this.callId)

    try {
      this.geminiSession = await createGeminiSession(
        systemPrompt,
        // onAudio: Gemini → Twilio
        (geminiAudioBase64) => {
          if (this.closed || !this.streamSid) return
          try {
            const mulawBase64 = geminiToTwilioAudio(geminiAudioBase64)
            this.ws.send(JSON.stringify({
              event:     'media',
              streamSid: this.streamSid,
              media:     { payload: mulawBase64 },
            }))
          } catch (e) {
            console.error(`[SESSION ${this.callId}] Audio send error:`, e.message)
          }
        },
        // onText: Gemini text output → disposition detection
        (text) => {
          this.textBuffer += ' ' + text
          console.log(`[SESSION ${this.callId}] Gemini text:`, text.slice(0, 100))

          // Detect opt-out in real-time
          if (!this.disposition && detectOptOut(text)) {
            this.disposition = 'do_not_call'
            console.log(`[SESSION ${this.callId}] Opt-out detected`)
            this.handleOptOut()
          }

          // Detect language switch
          const lang = detectLanguageSwitch(text)
          if (lang && lang !== this.detectedLang) {
            this.detectedLang = lang
            console.log(`[SESSION ${this.callId}] Language switched to: ${lang}`)
            this.logEvent('language_detected', { language: lang, text_snippet: text.slice(0, 100) })
            // Update call record with detected language
            if (this.callId && supabase) {
              supabase.from('voice_calls').update({ detected_language: lang }).eq('id', this.callId).catch(() => {})
            }
          }

          // Detect disposition
          const disp = detectDisposition(text)
          if (disp && !this.disposition) {
            this.disposition = disp
            console.log(`[SESSION ${this.callId}] Disposition: ${disp}`)
          }

          // Extract summary
          const summ = extractSummary(text)
          if (summ) this.summary = summ
        },
        // onToolCall
        (functionCalls) => this.handleToolCalls(functionCalls),
        // onClose
        () => {
          if (!this.closed) this.close('gemini_disconnected')
        }
      )

      // Start max duration timer
      this.callTimer = setTimeout(() => {
        if (!this.closed) {
          console.log(`[SESSION ${this.callId}] Max duration reached`)
          this.close('max_duration')
        }
      }, MAX_CALL_SECONDS * 1000)

      console.log(`[SESSION ${this.callId}] Gemini session ready — triggering opening`)
      // Send a complete minimal user turn (activity_start + silence + activity_end)
      // so Gemini generates its opening line. VAD is disabled; we control turns manually.
      this.geminiSession.triggerOpening()
    } catch (err) {
      console.error(`[SESSION ${this.callId}] Gemini init failed:`, err.message)
      // Continue without AI (call will be handled by Twilio fallback)
    }
  }

  handleTwilioMessage(data) {
    try {
      const msg = JSON.parse(data)

      switch (msg.event) {
        case 'connected':
          console.log(`[SESSION ${this.callId}] Twilio connected`)
          break

        case 'start':
          this.streamSid = msg.start?.streamSid ?? msg.streamSid
          console.log(`[SESSION ${this.callId}] Stream started: ${this.streamSid}`)
          this.logEvent('stream_started', { stream_sid: this.streamSid })
          break

        case 'media':
          if (msg.media?.payload && this.geminiSession) {
            // Twilio → Gemini (mulaw 8kHz → PCM 16kHz)
            const geminiAudio = twilioToGeminiAudio(msg.media.payload)
            this.geminiSession.send(geminiAudio)
            this.audioChunks++

            // Track speech for logging
            const rms = mulawRms(msg.media.payload)
            if (rms > SPEECH_RMS_THRESHOLD && !this.userSpeaking) {
              this.userSpeaking = true
              console.log(`[SESSION ${this.callId}] User speech detected (rms=${Math.round(rms)})`)
              clearTimeout(this.silenceTimer)
              this.silenceTimer = setTimeout(() => { this.userSpeaking = false }, SILENCE_END_MS)
            }
          }
          break

        case 'stop':
          console.log(`[SESSION ${this.callId}] Stream stopped`)
          this.close('twilio_stream_stop')
          break

        case 'mark':
          // Acknowledgement — ignore
          break
      }
    } catch (e) {
      console.error(`[SESSION ${this.callId}] Message parse error:`, e.message)
    }
  }

  async handleToolCalls(functionCalls) {
    const responses = []

    for (const fc of functionCalls) {
      console.log(`[SESSION ${this.callId}] Tool: ${fc.name}`, JSON.stringify(fc.args || {}))
      let response

      try {
        if (fc.name === 'check_availability') {
          const numSlots = fc.args?.num_slots || 3
          if (!this.calendarSettings?.google_refresh_token) {
            response = { error: 'Calendar not configured', slots: [] }
          } else {
            const slots = await getAvailableSlots(this.calendarSettings, numSlots)
            this.availableSlots = slots
            response = { slots: slots.map(s => ({ index: s.index, speech: s.speech })) }
            console.log(`[SESSION ${this.callId}] Calendar slots:`, slots.map(s => s.speech).join(', '))
          }

        } else if (fc.name === 'book_appointment') {
          const { slot_index = 0, lead_email, lead_name, business_name } = fc.args || {}
          const slot = this.availableSlots[slot_index]
          if (!slot) {
            response = { error: 'Slot not found', success: false }
          } else {
            const eventDetails = {
              slotStart:          slot.isoStart,
              slotEnd:            slot.isoEnd,
              timezone:           slot.timezone,
              leadName:           lead_name || this.leadId || 'Lead',
              businessName:       business_name || '',
              email:              lead_email,
              phone:              '',
              leadSource:         '',
              qualificationNotes: this.textBuffer.slice(-500),
              analyzerLinkSent:   false,
              callId:             this.callId,
            }

            try {
              const event = await createCalendarEvent(this.calendarSettings, eventDetails)
              this.bookingData = { event, slot, leadEmail: lead_email, leadName: lead_name }
              this.disposition = 'demo_booked'

              // Store in DB
              if (this.callId && supabase) {
                await supabase.from('voice_calls').update({
                  demo_booked:       true,
                  calendar_event_id: event.id,
                  disposition:       'demo_booked',
                }).eq('id', this.callId)

                await supabase.from('voice_bookings').insert({
                  call_id:              this.callId,
                  lead_id:              this.leadId || null,
                  calendar_event_id:    event.id,
                  calendar_id:          this.calendarSettings.google_calendar_id || 'primary',
                  appointment_datetime: slot.isoStart,
                  duration_minutes:     this.calendarSettings.booking_duration_minutes || 30,
                  timezone:             slot.timezone,
                  lead_email:           lead_email,
                  lead_first_name:      (lead_name || '').split(' ')[0],
                  lead_last_name:       (lead_name || '').split(' ').slice(1).join(' '),
                  business_name:        business_name,
                  meet_link:            event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || null,
                  booking_status:       'booked',
                }).catch(e => console.error('[DB] Booking insert error:', e.message))
              }

              await this.logEvent('demo_booked', {
                calendar_event_id: event.id,
                slot:              slot.speech,
                lead_email,
                meet_link:         event.hangoutLink
              })

              response = {
                success:   true,
                event_id:  event.id,
                slot:      slot.speech,
                meet_link: event.hangoutLink || null,
                message:   `Booked for ${slot.speech}`
              }
              console.log(`[SESSION ${this.callId}] DEMO BOOKED: ${slot.speech} | event: ${event.id}`)
            } catch (bookErr) {
              console.error(`[SESSION ${this.callId}] Booking failed:`, bookErr.message)
              response = { success: false, error: bookErr.message, fallback: 'send_analyzer_link' }
            }
          }

        } else if (fc.name === 'send_analyzer_link') {
          this.disposition = this.disposition || 'send_link'
          if (this.callId && supabase) {
            await supabase.from('voice_calls').update({ analyzer_link_sent: true }).eq('id', this.callId).catch(() => {})
          }
          if (this.leadId && supabase) {
            await supabase.from('voice_leads').update({ analyzer_link_sent: true, updated_at: new Date().toISOString() }).eq('id', this.leadId).catch(() => {})
          }
          await this.logEvent('analyzer_link_queued', { reason: fc.args?.reason })
          response = { success: true, message: 'Analyzer link will be sent after the call' }

        } else if (fc.name === 'log_qualification') {
          const { classification, notes } = fc.args || {}
          this.qualificationClass = classification
          if (this.callId && supabase) {
            await supabase.from('voice_calls').update({
              lead_classification:  classification,
              qualification_notes:  notes,
            }).eq('id', this.callId).catch(() => {})
          }
          await this.logEvent('lead_classified', { classification, notes })
          console.log(`[SESSION ${this.callId}] Classified: ${classification}`)
          response = { success: true, classification }

        } else {
          response = { error: `Unknown tool: ${fc.name}` }
        }
      } catch (e) {
        console.error(`[SESSION ${this.callId}] Tool error (${fc.name}):`, e.message)
        response = { error: e.message }
      }

      responses.push({ id: fc.id, response })
    }

    if (this.geminiSession && responses.length) {
      this.geminiSession.sendToolResponse(responses)
    }
  }

  async handleOptOut() {
    await this.logEvent('opt_out_detected', { text_buffer: this.textBuffer.slice(-200) })

    // Add to suppression list
    if (this.leadId && supabase) {
      const { data: lead } = await supabase
        .from('voice_leads')
        .select('phone_e164')
        .eq('id', this.leadId)
        .single()

      if (lead?.phone_e164) {
        await supabase.from('voice_suppression_list').upsert(
          { phone_e164: lead.phone_e164, reason: 'opted_out', source: this.callId },
          { onConflict: 'phone_e164' }
        )
        await supabase.from('voice_leads').update({
          do_not_call:  true,
          opted_out_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }).eq('id', this.leadId)
      }
    }
  }

  async close(reason) {
    if (this.closed) return
    this.closed = true

    clearTimeout(this.callTimer)
    clearTimeout(this.silenceTimer)
    if (this.geminiSession) {
      try { this.geminiSession.close() } catch {}
    }

    const duration = Math.round((Date.now() - this.startTime) / 1000)
    console.log(`[SESSION ${this.callId}] Closed (${reason}), duration: ${duration}s, disposition: ${this.disposition}`)

    // Update call record
    if (this.callId && supabase) {
      const updates = {
        status:            'completed',
        ended_at:          new Date().toISOString(),
        duration_seconds:  duration,
        transcription:     this.textBuffer.trim() || null,
        summary:           this.summary,
        detected_language: this.detectedLang,
      }
      if (this.disposition) updates.disposition = this.disposition

      await supabase.from('voice_calls').update(updates).eq('id', this.callId)

      // Ensure post-call actions are completed
      const finalUpdates = {
        lead_classification:  this.qualificationClass,
        analyzer_link_sent:   !this.bookingData && this.disposition === 'send_link',
        demo_booked:          this.disposition === 'demo_booked',
      }
      if (this.disposition) finalUpdates.disposition = this.disposition
      await supabase.from('voice_calls').update(finalUpdates).eq('id', this.callId).catch(() => {})
    }

    // Update lead stats
    if (this.leadId && this.disposition && supabase) {
      const leadUpdates = {
        last_disposition: this.disposition,
        updated_at:       new Date().toISOString(),
      }
      if (this.disposition === 'do_not_call')        { leadUpdates.do_not_call = true; leadUpdates.opted_out_at = new Date().toISOString() }
      if (this.disposition === 'send_link')           leadUpdates.analyzer_link_sent = true
      if (this.disposition === 'callback_requested')  leadUpdates.callback_requested = true
      if (this.disposition === 'transferred_live')    leadUpdates.transferred_live = true

      // Apply score delta
      const SCORE_DELTAS = {
        transferred_live: 35, decision_maker: 30, send_link: 25, callback_requested: 20,
        interested: 15, not_interested: -10, gatekeeper: -5, voicemail: -10,
        no_answer: -5, wrong_number: -25, bad_number: -30, do_not_call: -50, business_closed: -20
      }
      const delta = SCORE_DELTAS[this.disposition] ?? 0
      if (delta !== 0) {
        const { data: lead } = await supabase.from('voice_leads').select('lead_quality_score').eq('id', this.leadId).single()
        if (lead) {
          const newScore = Math.max(0, Math.min(100, (lead.lead_quality_score ?? 50) + delta))
          const newTier  = newScore >= 70 ? 1 : newScore >= 40 ? 2 : 3
          leadUpdates.lead_quality_score = newScore
          leadUpdates.lead_priority_tier = newTier

          await supabase.from('voice_lead_scores').insert({
            lead_id:      this.leadId,
            score_before: lead.lead_quality_score ?? 50,
            score_after:  newScore,
            delta,
            reason:       this.disposition,
          })
        }
      }

      await supabase.from('voice_leads').update(leadUpdates).eq('id', this.leadId)

      // Auto-suppress on bad dispositions
      if (['do_not_call', 'bad_number', 'wrong_number'].includes(this.disposition)) {
        const { data: lead } = await supabase.from('voice_leads').select('phone_e164').eq('id', this.leadId).single()
        if (lead?.phone_e164) {
          await supabase.from('voice_suppression_list').upsert(
            { phone_e164: lead.phone_e164, reason: this.disposition, source: this.callId },
            { onConflict: 'phone_e164' }
          )
        }
      }
    }

    // Send analyzer link via SMS if flagged
    if (this.disposition === 'send_link' && this.leadPhone && this.analyzerUrl) {
      const smsBody = `Hi, it's Sarah from SourcifyLending! Here's the free business funding analyzer I mentioned — it only takes a couple minutes: ${this.analyzerUrl}`
      const sent = await sendSms(this.leadPhone, smsBody)
      if (sent && this.callId && supabase) {
        supabase.from('voice_calls').update({ analyzer_sms_sent: true }).eq('id', this.callId).catch(() => {})
      }
    }

    await this.logEvent('call_ended', {
      reason, duration, disposition: this.disposition, summary: this.summary
    })
  }

  async logEvent(eventType, data = {}) {
    if (!this.callId || !supabase) return
    try {
      await supabase.from('voice_call_events').insert({
        call_id:    this.callId,
        event_type: eventType,
        event_data: data,
        timestamp:  new Date().toISOString(),
      })
    } catch {}
  }
}

// ─── HTTP + WebSocket server ────────────────────────────────────
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status:   'ok',
      service:  'SourcifyLending Voice Server',
      port:     PORT,
      model:    GEMINI_MODEL,
      gemini:   !!GEMINI_API_KEY,
      supabase: !!(SUPABASE_URL && SUPABASE_KEY),
      uptime:   process.uptime(),
    }))

  } else if (url.pathname === '/test-gemini') {
    // Diagnostic: test Gemini Live connection end-to-end
    const log = []
    const result = { ok: false, log, model: GEMINI_MODEL }
    try {
      // 1. Check available models
      const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageSize=200`)
      const modelsData = await modelsRes.json()
      if (modelsData.error) {
        log.push(`Models API error: ${JSON.stringify(modelsData.error)}`)
      } else {
        const liveModels = (modelsData.models || []).map(m => m.name).filter(n => n.includes('live') || n.includes('flash'))
        log.push(`Live-capable models: ${liveModels.join(', ') || 'NONE'}`)
      }

      // 2. Try connecting to Gemini Live WebSocket
      await new Promise((resolve) => {
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${GEMINI_API_VER}.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`
        const ws = new WebSocket(wsUrl)
        const timeout = setTimeout(() => { log.push('Timeout: no setupComplete after 8s'); ws.close(); resolve() }, 8000)

        ws.on('open', () => {
          log.push('WebSocket opened')
          ws.send(JSON.stringify({ setup: { model: GEMINI_MODEL, generation_config: { response_modalities: ['AUDIO'] }, system_instruction: { parts: [{ text: 'You are a test assistant.' }] } } }))
          log.push('Setup sent')
        })
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.setupComplete) {
            log.push('setupComplete received!')
            // Send client_content to trigger a response
            ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Say hello briefly.' }] }], turnComplete: true } }))
            log.push('clientContent sent')
          }
          if (msg.serverContent?.modelTurn?.parts?.length) {
            const parts = msg.serverContent.modelTurn.parts
            const hasAudio = parts.some(p => p.inlineData?.mimeType?.startsWith('audio/'))
            const text = parts.filter(p => p.text).map(p => p.text).join('')
            log.push(`Model response: audio=${hasAudio}, text="${text.slice(0, 100)}"`)
            result.ok = true
            clearTimeout(timeout)
            ws.close()
            resolve()
          }
          if (msg.error) { log.push(`Error: ${JSON.stringify(msg.error)}`); clearTimeout(timeout); ws.close(); resolve() }
        })
        ws.on('error', (e) => { log.push(`WS error: ${e.message}`); clearTimeout(timeout); resolve() })
        ws.on('close', (code, reason) => { log.push(`WS closed: code=${code} reason="${reason?.toString()}"`); clearTimeout(timeout); resolve() })
      })
    } catch (e) {
      log.push(`Exception: ${e.message}`)
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result, null, 2))

  } else {
    res.writeHead(404)
    res.end()
  }
})

// Use noServer mode to manually route WebSocket paths — avoids ws library bug
// where multiple servers on the same httpServer cause cross-path abortHandshake
// to destroy already-upgraded sockets (code 1006 immediate drop).
const wss      = new WebSocketServer({ noServer: true })
const adminWss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname
  if (pathname === '/stream') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else if (pathname === '/admin') {
    adminWss.handleUpgrade(req, socket, head, (ws) => {
      adminWss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

// Track active sessions
const activeSessions = new Map()

wss.on('connection', (ws, req) => {
  console.log('[VOICE SERVER] New WebSocket connection from Twilio')

  // Parse initial params from URL (they also come in 'start' event)
  const url       = new URL(req.url, `http://localhost:${PORT}`)
  let callId      = url.searchParams.get('callId')    ?? ''
  let leadId      = url.searchParams.get('leadId')    ?? ''
  let campaignId  = url.searchParams.get('campaignId') ?? ''

  const session = new CallSession(ws, callId, leadId, campaignId)
  activeSessions.set(ws, session)

  // Initialize Gemini async
  session.initialize().catch(err => {
    console.error('[VOICE SERVER] Session init error:', err.message)
  })

  ws.on('message', (data) => {
    // Parse callId/leadId from first 'start' event if not in URL
    try {
      const msg = JSON.parse(data.toString())
      if (msg.event === 'start' && msg.start?.customParameters) {
        const p = msg.start.customParameters
        if (!session.callId    && p.callId)     session.callId     = p.callId
        if (!session.leadId    && p.leadId)     session.leadId     = p.leadId
        if (!session.campaignId && p.campaignId) session.campaignId = p.campaignId
      }
    } catch {}

    session.handleTwilioMessage(data.toString())
  })

  ws.on('close', (code, reason) => {
    console.log(`[VOICE SERVER] Twilio WS closed: code=${code}, reason="${reason?.toString()}"`)
    activeSessions.delete(ws)
    session.close('websocket_closed')
  })

  ws.on('error', (err) => {
    console.error('[VOICE SERVER] WebSocket error:', err.message)
    activeSessions.delete(ws)
    session.close('websocket_error')
  })
})

// ─── Admin endpoint: list active calls ─────────────────────────
adminWss.on('connection', (ws) => {
  // Broadcast active call count
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type:         'active_calls',
        count:        activeSessions.size,
        calls:        [...activeSessions.values()].map(s => ({
          callId:     s.callId,
          leadId:     s.leadId,
          duration:   Math.round((Date.now() - s.startTime) / 1000),
          disposition: s.disposition,
          audioChunks: s.audioChunks,
        })),
        timestamp:    new Date().toISOString(),
      }))
    }
  }, 2000)

  ws.on('close', () => clearInterval(interval))
})

// ─── Startup: log available Gemini models ───────────────────────
async function logAvailableGeminiModels() {
  if (!GEMINI_API_KEY) return
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageSize=100`)
    const data = await res.json()
    if (data.error) {
      console.error('[GEMINI] Models list error:', JSON.stringify(data.error))
      return
    }
    const all = (data.models || []).map(m => m.name)
    const live = all.filter(n => n.includes('live') || n.includes('flash-live'))
    console.log('[GEMINI] Live-capable models:', live.length ? live.join(', ') : 'NONE FOUND')
    console.log('[GEMINI] All available models:', all.join(', '))
  } catch (e) {
    console.error('[GEMINI] Models list fetch failed:', e.message)
  }
}

// ─── Start ─────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   SourcifyLending Voice Agent Server                 ║
║   Listening on port ${String(PORT).padEnd(31)}║
║   Stream endpoint: ws://HOST:${PORT}/stream          ║
║   Health check:    http://HOST:${PORT}/health        ║
║   Gemini: ${GEMINI_API_KEY ? '✓ configured' : '✗ NOT configured — add GEMINI_API_KEY'}${' '.repeat(Math.max(0, 20 - (GEMINI_API_KEY ? 14 : 28)))}║
╚══════════════════════════════════════════════════════╝
`)
  logAvailableGeminiModels()
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[VOICE SERVER] Shutting down...')
  for (const session of activeSessions.values()) {
    session.close('server_shutdown')
  }
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[VOICE SERVER] Ctrl+C received')
  httpServer.close(() => process.exit(0))
})
