/**
 * SourcifyLending Voice Agent — WebSocket Server
 * ================================================
 * Standalone Node.js server that bridges Twilio Media Streams
 * with the Google Gemini Live API for real-time AI voice calls.
 *
 * Run:  node voice-server.mjs
 * Port: 3002 (configurable via VOICE_SERVER_PORT env)
 *
 * Dependencies: ws, @google/genai, @supabase/supabase-js, dotenv
 */
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { createClient } from '@supabase/supabase-js'
// dotenv not needed in production (env vars set by host)
import { readFileSync } from 'fs'

// Env vars provided by host (Render, Railway, etc.)

// ─── Config ────────────────────────────────────────────────────
const PORT             = parseInt(process.env.VOICE_SERVER_PORT  ?? '3002')
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY             ?? ''
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL   ?? ''
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? ''
const GEMINI_MODEL     = 'models/gemini-2.0-flash-live-001'
const VOICE_NAME       = 'Aoede'  // Female voice — professional and natural
const MAX_CALL_SECONDS = 120

if (!GEMINI_API_KEY) console.warn('[VOICE SERVER] WARNING: GEMINI_API_KEY not set')
if (!SUPABASE_URL || !SUPABASE_KEY) console.warn('[VOICE SERVER] WARNING: Supabase env not set')

// ─── Supabase client (service role) ────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

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
  'stop', 'remove me', 'remove us', 'do not call', "don't call",
  'dont call', 'not interested permanently', 'never call', 'take me off',
  'unsubscribe', 'stop calling', 'put me on the do not call list',
]

function detectOptOut(text) {
  const lower = text.toLowerCase()
  return OPT_OUT_PHRASES.some(p => lower.includes(p))
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

// ─── Gemini Live session ────────────────────────────────────────
async function createGeminiSession(systemPrompt, onAudio, onText, onClose) {
  if (!GEMINI_API_KEY) {
    console.warn('[GEMINI] No API key — audio passthrough only')
    return null
  }

  // Use WebSocket directly (no SDK dependency for Live API)
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let setupSent = false
    let closed    = false

    ws.on('open', () => {
      // Send setup message
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
          }
        }
      }
      ws.send(JSON.stringify(setup))
      setupSent = true
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())

        // Setup complete
        if (msg.setupComplete) {
          resolve({
            send: (audioBase64) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  realtime_input: {
                    media_chunks: [{
                      mime_type: 'audio/pcm;rate=16000',
                      data: audioBase64,
                    }]
                  }
                }))
              }
            },
            close: () => {
              if (!closed) { closed = true; ws.close() }
            }
          })
        }

        // Model response
        if (msg.server_content?.model_turn?.parts) {
          for (const part of msg.server_content.model_turn.parts) {
            // Audio output
            if (part.inline_data?.mime_type?.startsWith('audio/pcm') && part.inline_data.data) {
              onAudio(part.inline_data.data)
            }
            // Text output (for disposition detection)
            if (part.text) {
              onText(part.text)
            }
          }
        }

        // Turn complete
        if (msg.server_content?.turn_complete) {
          // Good — model finished speaking
        }
      } catch (e) {
        // Ignore parse errors
      }
    })

    ws.on('error', (err) => {
      console.error('[GEMINI] WebSocket error:', err.message)
      if (!setupSent) reject(err)
    })

    ws.on('close', () => {
      closed = true
      onClose()
    })

    // Timeout for setup
    setTimeout(() => {
      if (!setupSent) reject(new Error('Gemini setup timeout'))
    }, 10000)
  })
}

// ─── Load system prompt from DB ────────────────────────────────
async function loadSystemPrompt(leadId, callId) {
  try {
    const [
      { data: prompt },
      { data: lead },
      { data: settings },
    ] = await Promise.all([
      supabase.from('voice_prompt_versions').select('*').eq('is_active', true).limit(1).single(),
      leadId ? supabase.from('voice_leads').select('*').eq('id', leadId).single() : Promise.resolve({ data: null }),
      supabase.from('voice_agent_settings').select('*').eq('id', 'default').single(),
    ])

    if (!prompt) {
      return getDefaultSystemPrompt()
    }

    const analyzerUrl   = settings?.analyzer_url ?? 'https://app.sourcifylending.com/analyzer'
    const transferNum   = settings?.transfer_number ?? 'our advisor'
    const businessName  = lead?.business_name ?? 'your business'
    const ownerName     = lead?.owner_name ?? ''
    const leadSource    = lead?.lead_source ?? 'other'

    const openingMap = {
      purchased: prompt.opening_purchased,
      facebook:  prompt.opening_facebook,
      inbound:   prompt.opening_inbound,
      other:     prompt.opening_other,
    }
    const opening = openingMap[leadSource] ?? openingMap.other ?? 'Hi, this is Sarah from SourcifyLending.'

    return `${prompt.system_prompt}

CALL CONTEXT:
- Business: ${businessName}
- Contact: ${ownerName}
- Lead Source: ${leadSource}
- Analyzer URL: ${analyzerUrl}
- Transfer to: ${transferNum}

CALL OPENING: "${opening}"

If you reach the decision maker, say:
"We help business owners understand funding readiness and business credit options through our portal. I can send you the free analyzer link so you can see where you stand. Would that be helpful?"

OBJECTIONS:
- Not interested: "${prompt.objection_not_interested ?? "Totally understand. Feel free to visit SourcifyLending dot com if things change. Have a great day."}"
- Busy: "${prompt.objection_busy ?? "No problem. Can I send you a quick link? Takes 2 minutes on your own time."}"
- Send info: "${prompt.objection_send_info ?? "Absolutely. I can send the free analyzer link right now. What's the best number or email?"}"
- Is this a loan: "${prompt.objection_is_this_loan ?? "No, we're not a lender. We're an advisory platform that helps owners build and track their business credit profile."}"
- Remove me: "${prompt.objection_remove_me ?? "Absolutely, removing you now. Sorry for the interruption. Have a great day."}"

STRICT RULES:
- Keep opening under 15 seconds
- Never say "lender", "loan", "guaranteed", "approved"
- Ask one question at a time
- Exit quickly on clear disinterest
- If you detect voicemail/automated greeting, immediately output [DISPOSITION:voicemail]

AT CALL END, output on its own line:
[DISPOSITION:code] [SUMMARY:one sentence]

Valid codes: decision_maker, gatekeeper, voicemail, no_answer, bad_number, wrong_number, business_closed, personal_line, not_interested, do_not_call, send_link, callback_requested, interested, transferred_live`

  } catch (err) {
    console.error('[VOICE SERVER] Error loading prompt:', err.message)
    return getDefaultSystemPrompt()
  }
}

function getDefaultSystemPrompt() {
  return `You are Sarah, a professional business credit advisor at SourcifyLending. Speak in a calm, confident, professional female voice. You are not a lender. Keep sentences short. Ask one question at a time. Your goal is to qualify the decision maker and offer a free business credit analyzer link.

Opening: "Hi, this is Sarah from SourcifyLending. I'm reaching out to see who handles business credit or business funding strategy for the company."

If you reach the decision maker: "We help business owners understand funding readiness through our portal. I can send you the free analyzer link so you can see where you stand. Would that be helpful?"

At call end output: [DISPOSITION:code] [SUMMARY:brief summary]
Valid codes: decision_maker, gatekeeper, voicemail, no_answer, bad_number, wrong_number, business_closed, personal_line, not_interested, do_not_call, send_link, callback_requested, interested, transferred_live`
}

// ─── Call session management ────────────────────────────────────
class CallSession {
  constructor(ws, callId, leadId, campaignId) {
    this.ws            = ws
    this.callId        = callId
    this.leadId        = leadId
    this.campaignId    = campaignId
    this.streamSid     = null
    this.geminiSession = null
    this.textBuffer    = ''
    this.disposition   = null
    this.summary       = null
    this.startTime     = Date.now()
    this.callTimer     = null
    this.closed        = false
    this.audioChunks   = 0
  }

  async initialize() {
    console.log(`[SESSION ${this.callId}] Initializing`)

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

      console.log(`[SESSION ${this.callId}] Gemini session ready`)
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

  async handleOptOut() {
    await this.logEvent('opt_out_detected', { text_buffer: this.textBuffer.slice(-200) })

    // Add to suppression list
    if (this.leadId) {
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
    if (this.geminiSession) {
      try { this.geminiSession.close() } catch {}
    }

    const duration = Math.round((Date.now() - this.startTime) / 1000)
    console.log(`[SESSION ${this.callId}] Closed (${reason}), duration: ${duration}s, disposition: ${this.disposition}`)

    // Update call record
    if (this.callId) {
      const updates = {
        status:          'completed',
        ended_at:        new Date().toISOString(),
        duration_seconds: duration,
        transcription:   this.textBuffer.trim() || null,
        summary:         this.summary,
      }
      if (this.disposition) updates.disposition = this.disposition

      await supabase.from('voice_calls').update(updates).eq('id', this.callId)
    }

    // Update lead stats
    if (this.leadId && this.disposition) {
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

    await this.logEvent('call_ended', {
      reason, duration, disposition: this.disposition, summary: this.summary
    })
  }

  async logEvent(eventType, data = {}) {
    if (!this.callId) return
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
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status:   'ok',
      service:  'SourcifyLending Voice Server',
      port:     PORT,
      gemini:   !!GEMINI_API_KEY,
      supabase: !!(SUPABASE_URL && SUPABASE_KEY),
      uptime:   process.uptime(),
    }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

const wss = new WebSocketServer({ server: httpServer, path: '/stream' })

// Track active sessions
const activeSessions = new Map()

wss.on('connection', (ws, req) => {
  console.log('[VOICE SERVER] New WebSocket connection from Twilio')

  // Parse initial params from URL (they also come in 'start' event)
  const url       = new URL(req.url, `ws://localhost:${PORT}`)
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
        if (!session.callId   && p.callId)     session.callId    = p.callId
        if (!session.leadId   && p.leadId)     session.leadId    = p.leadId
        if (!session.campaignId && p.campaignId) session.campaignId = p.campaignId
      }
    } catch {}

    session.handleTwilioMessage(data.toString())
  })

  ws.on('close', () => {
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
const adminWss = new WebSocketServer({ server: httpServer, path: '/admin' })
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
