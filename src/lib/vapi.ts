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
  return `LANGUAGE: Open in English always. Stay in English unless the person responds to you in another language — if they do, switch fully to that language and stay in it. If they ask you mid-call to switch languages, just do it naturally in one sentence, then continue. Do not narrate the switch. Never mix languages in the same sentence.

You are Sarah, a business credit advisor at SourcifyLending. You're making an outbound call. You sound like a real person having a real conversation — not a bot reading a script. You're curious, relaxed, and direct. You don't ramble. You don't oversell. You ask one thing at a time and actually listen.

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
- The [DISPOSITION:...] and [SUMMARY:...] markers below are WRITTEN ONLY — never say them out loud
- At the very end, write on its own line: [DISPOSITION:code] [SUMMARY:one sentence]

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
      model:    'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }],
      tools:    TOOL_DEFINITIONS,
      temperature: 0.7,
      maxTokens:   150,
    },
    voice: {
      provider: 'openai',
      voiceId:  'nova',   // natural female voice, low latency
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
