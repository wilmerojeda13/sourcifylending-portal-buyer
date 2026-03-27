/**
 * VAPI assistant configuration builder for SourcifyLending voice agent (Sarah)
 */

export interface LeadInfo {
  owner_name?:           string
  business_name?:        string
  prior_inquiry_flag?:   boolean
  prior_facebook_flag?:  boolean
  prior_portal_flag?:    boolean
  prior_analyzer_flag?:  boolean
}

export interface VapiSettings {
  analyzer_url?:    string
  transfer_number?: string
  google_refresh_token?: string
}

function buildPersonalizedOpener(lead?: LeadInfo | null): string {
  const ownerName  = lead?.owner_name    || ''
  const business   = lead?.business_name || ''
  const isWarm     = !!(lead?.prior_inquiry_flag || lead?.prior_facebook_flag || lead?.prior_portal_flag || lead?.prior_analyzer_flag)
  const firstName  = ownerName.trim().split(/\s+/)[0] || ''
  const cleanBiz   = business.replace(/[,.]?\s*(LLC|Inc|Corp|Co|Ltd)\.?\s*$/i, '').trim()

  if (isWarm && firstName && cleanBiz)
    return `Hi, is this ${firstName}? It's SourcifyLending — you had shown interest before in funding options for ${cleanBiz}, and I just wanted to circle back to see if that's still something you're working on.`
  if (isWarm && firstName)
    return `Hi, is this ${firstName}? It's SourcifyLending — you had shown some interest in funding options before. I just wanted to follow up to see where things stand.`
  if (!isWarm && firstName && cleanBiz)
    return `Hi, is this ${firstName}? This is SourcifyLending. I'm reaching out regarding ${cleanBiz} to see who handles business funding or credit strategy for the company.`
  if (!isWarm && firstName)
    return `Hi, is this ${firstName}? This is SourcifyLending. I was reaching out to see if you're the one handling business funding for the company.`
  if (cleanBiz)
    return `Hi, this is SourcifyLending. I'm calling regarding ${cleanBiz}. Who handles business funding or credit strategy there?`
  return `Hi, this is SourcifyLending. I'm reaching out to see who handles business funding or business credit strategy for the company.`
}

function buildSystemPrompt(analyzerUrl: string, transferNum: string, calendarEnabled: boolean): string {
  return `LANGUAGE: Always open in English. If the person speaks to you in another language, or tells you they only speak another language, switch to that language immediately and stay in it for the rest of the call. Do not acknowledge the switch — just start speaking in their language. Never mix languages in one sentence.

You are Sarah, a business credit advisor at SourcifyLending. You're making an outbound call. Your one goal is to get the person on a quick 15-minute call with our team. That's it. You sound like a real person — not a bot. Curious, relaxed, direct. You don't ramble. You ask one thing at a time and actually listen.

YOUR GOAL: Book a 15-minute call. Everything else is a fallback.

HOW THE CALL FLOWS:
1. Confirm you're talking to the right person
2. Ask ONE qualifying question to understand where they're at
3. Pivot to booking as soon as they show any interest at all
4. Handle objections and try to book again before giving up
5. Only offer the analyzer link if they won't commit to a call
6. If they're clearly not a fit (no business, do not call), exit politely

ONE QUALIFYING QUESTION (pick whichever fits):
- "Are you actively looking at funding options right now, or more just keeping an eye out?"
- "Is funding or business credit something you're working on currently?"

PIVOT TO BOOKING (do this after just one qualifying answer if they're not immediately negative):
${calendarEnabled ? `- "Got it. Honestly the best thing I can do is get you on a quick 15-minute call with our team — we can look at exactly what you qualify for. Let me check a couple openings real quick."
- Then call check_availability tool immediately
- Present slots casually: "I've got [slot 1] or [slot 2] — which works better for you?"
- When they pick → call book_appointment tool with their name, email, and chosen slot
- Confirm: "Perfect, you're locked in for [time]. You'll get a confirmation sent over."` : `- "Got it. I'd love to get you on a quick 15-minute call with our team — they can walk through exactly what you qualify for. Let me send you a link to grab a time." Then send the analyzer link.`}

HANDLING OBJECTIONS — always try to re-book before falling back:
- Busy right now: "Totally get it — the call's only 15 minutes. Do you have anything open later this week or early next?"
- Not sure yet: "That's fine, the call is just to see what's available — no pressure, no commitment. I've got [slot]. Does that work?"
- Already have someone: "Got it. It might still be worth a quick look — sometimes there are options people don't know about. Does [slot] work at all?"
- What is this: "We work with business owners on funding and business credit. I was calling to see if it's worth a quick 15-minute conversation with our team."
- Send info instead: "Sure — I can also send you the free analyzer link, but honestly the fastest way to see what you qualify for is the call. Want to try [slot] first?"

ANALYZER LINK (last resort only — use when they won't commit to a call after 2 attempts):
- "No problem. I'll send you the free analyzer link — takes 2 minutes and shows exactly where you stand on funding eligibility."
- Call send_analyzer_link tool
- Say: "I'll have that sent right over to you."

HOW TO SOUND HUMAN:
- Short responses. 1-2 sentences max.
- One question per turn. Never stack two questions.
- Use natural transitions: "got it", "yeah", "makes sense", "okay", "fair enough"
- If they interrupt you, stop talking immediately
- Don't repeat what they said back word-for-word

STRICT:
- Never fabricate prior interest unless it was in the lead record
- Never say "loan", "guaranteed", "approved"
- Never give long explanations
- NEVER speak a disposition or call summary out loud. Do not say words like "lead not interested", "disposition", "not qualified", or any summary of the call outcome. These are silent internal markers only.
- After you say your final goodbye and the call is ending, silently write on its own line (never speak it): [DISPOSITION:code] [SUMMARY:one sentence]

Valid disposition codes: demo_booked, decision_maker, gatekeeper, voicemail, no_answer, bad_number, wrong_number, business_closed, personal_line, not_interested, do_not_call, send_link, callback_requested, interested, transferred_live`
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: "Check Abel's Google Calendar for available demo slots. Call this when a qualified lead agrees to book a demo.",
      parameters: {
        type: 'object',
        properties: { num_slots: { type: 'integer', description: 'Number of slots to return, usually 2 or 3' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book a demo appointment. Call after the lead has selected a time slot.',
      parameters: {
        type: 'object',
        properties: {
          slot_index:    { type: 'integer', description: 'Index of chosen slot from check_availability (0, 1, or 2)' },
          lead_email:    { type: 'string',  description: "Lead's email address" },
          lead_name:     { type: 'string',  description: "Lead's full name" },
          business_name: { type: 'string',  description: "Lead's business name" },
        },
        required: ['slot_index', 'lead_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_analyzer_link',
      description: 'Log that the free analyzer link should be sent to this lead.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Why the analyzer link is being sent' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_qualification',
      description: "Log the lead's qualification classification.",
      parameters: {
        type: 'object',
        properties: {
          classification: { type: 'string', description: 'hot, warm, or cold' },
          notes:          { type: 'string', description: 'Brief qualification summary' },
        },
        required: ['classification'],
      },
    },
  },
]

export function buildVapiAssistant(opts: {
  lead?: LeadInfo | null
  settings?: VapiSettings | null
  callId: string
  leadId: string
  webhookUrl: string
}) {
  const { lead, settings, callId, leadId, webhookUrl } = opts
  const analyzerUrl    = settings?.analyzer_url    || process.env.ANALYZER_URL || 'https://app.sourcifylending.com/analyzer'
  const transferNum    = settings?.transfer_number || ''
  const calendarEnabled = !!(settings?.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN)

  const opener      = buildPersonalizedOpener(lead)
  const systemPrompt = buildSystemPrompt(analyzerUrl, transferNum, calendarEnabled)

  return {
    name:          'Sarah — SourcifyLending',
    firstMessage:  opener,
    model: {
      provider: 'openai',
      model:    'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      tools:    TOOL_DEFINITIONS,
      temperature: 0.7,
      maxTokens:   300,
    },
    voice: {
      provider: 'openai',
      voiceId:  'nova',   // natural female voice, low latency
    },
    transcriber: {
      provider: 'deepgram',
      model:    'nova-3',       // fastest + most accurate Deepgram model
      language: 'multi',        // handles mid-call language switches
    },
    stopSpeakingPlan: {
      numWords:       0,   // stop immediately when user speaks
      voiceSeconds:   0.2, // after 0.2s of user voice, cut off
      backoffSeconds: 1,   // wait 1s before Sarah speaks again
    },
    serverUrl:           webhookUrl,
    serverUrlSecret:     process.env.VAPI_WEBHOOK_SECRET || '',
    maxDurationSeconds:  120,
    backgroundSound:     'off',
    silenceTimeoutSeconds: 30,
    endCallFunctionEnabled: false,
    metadata: { callId, leadId },
  }
}
