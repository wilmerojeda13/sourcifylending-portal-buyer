/**
 * Voice Agent Script Engine
 *
 * Builds the Gemini Live system prompt for each call,
 * adapting tone and opening based on lead source.
 */
import type { VoiceLead, VoiceAgentSettings, VoicePromptVersion } from '@/types'

export interface CallContext {
  lead:            VoiceLead
  settings:        VoiceAgentSettings
  promptVersion:   VoicePromptVersion
  callId:          string
  recordingDisclosure: boolean
}

/**
 * Build the full system prompt for a specific call.
 */
export function buildSystemPrompt(ctx: CallContext): string {
  const { lead, settings, promptVersion, recordingDisclosure } = ctx

  const analyzerUrl = settings.analyzer_url ?? 'https://app.sourcifylending.com/analyzer'
  const transferNum = settings.transfer_number ?? 'Abel'
  const businessName = lead.business_name ?? 'their business'
  const ownerName   = lead.owner_name ?? ''

  const openingBySource = {
    purchased: promptVersion.opening_purchased ?? 'Hi, this is Sarah from SourcifyLending. I\'m reaching out to see who handles business credit or business funding strategy for the company.',
    facebook:  promptVersion.opening_facebook  ?? 'Hi, this is Sarah from SourcifyLending. We noticed you had expressed interest in business funding resources. I wanted to follow up briefly.',
    inbound:   promptVersion.opening_inbound   ?? 'Hi, this is Sarah from SourcifyLending. You had recently reached out to us, and I wanted to personally follow up.',
    other:     promptVersion.opening_other     ?? 'Hi, this is Sarah from SourcifyLending. I\'m reaching out to see who handles business credit or business funding strategy for the company.',
  }

  const opening = openingBySource[lead.lead_source as keyof typeof openingBySource] ?? openingBySource.other

  const objectionBlock = `
OBJECTION HANDLING — use these responses exactly or adapt naturally:
- Not interested: "${promptVersion.objection_not_interested ?? 'Totally understand. I\'ll let you go. If things change, feel free to visit SourcifyLending dot com. Have a great day.'}"
- Too busy: "${promptVersion.objection_busy ?? 'No problem at all. Can I send you a quick link to check your business credit profile? Takes 2 minutes on your own time.'}"
- Send info: "${promptVersion.objection_send_info ?? 'Absolutely. I can send you a short link to our free business credit analyzer. What\'s the best number or email?'}"
- Already funded: "${promptVersion.objection_already_funded ?? 'That\'s great to hear. We focus on business credit strategy and ongoing monitoring — would a free analysis still be helpful?'}"
- Working with someone: "${promptVersion.objection_working_with_someone ?? 'Got it, no problem. I just wanted to make sure you have access to our free tool as well. Feel free to visit SourcifyLending dot com anytime.'}"
- What is this: "${promptVersion.objection_what_is_this ?? 'Great question. We\'re an advisory platform — we help business owners build and monitor their business credit profile. We\'re not a lender.'}"
- Is this a loan: "${promptVersion.objection_is_this_loan ?? 'No, we\'re not a lender at all. We\'re a business credit advisory platform. We help owners understand their credit profile and funding readiness.'}"
- Remove me: "${promptVersion.objection_remove_me ?? 'Absolutely, I\'ll remove you right away. Sorry for the interruption. Have a great day.'}"
`.trim()

  const transferBlock = `
TRANSFER & FOLLOW-UP:
- If the prospect is highly interested and wants to speak with someone right now, say: "Let me connect you with our advisor right now." Then output [DISPOSITION:transferred_live] and end.
- If they want a callback, confirm a time and say: "Perfect, we\'ll give you a call then." Then output [DISPOSITION:callback_requested].
- If they want a link, say: "Perfect, I\'m sending the link to our free analyzer now. The URL is: ${analyzerUrl}" Then output [DISPOSITION:send_link].
`.trim()

  const recordingNotice = recordingDisclosure
    ? 'IMPORTANT: At the very start of the call, before anything else, say: "This call may be recorded for quality and training purposes."'
    : ''

  const prompt = `${promptVersion.system_prompt}

CALL CONTEXT:
- Business: ${businessName}
- Contact: ${ownerName}
- Lead Source: ${lead.lead_source}
- Analyzer URL: ${analyzerUrl}
- Transfer contact: ${transferNum}

CALL OPENING:
Start the conversation with this exact opening (adapt naturally if needed):
"${opening}"

After the opening, if you reach the decision maker, say:
"We help business owners understand funding readiness and business credit options through our portal. I can send you the free analyzer link so you can see where you stand. Would that be helpful?"

${objectionBlock}

${transferBlock}

${recordingNotice}

STRICT RULES:
- Keep your intro under 15 seconds
- Never say "lender", "loan", "guaranteed", "approved", "funding secured"
- Never use hype language or pressure tactics
- Ask only one question at a time
- If someone is clearly not interested after 2 attempts, exit gracefully
- Maximum call duration: keep conversation under 90 seconds unless prospect is highly engaged
- If you hear "voicemail" or an automated greeting, say nothing and immediately output [DISPOSITION:voicemail]
- If you detect a fax tone or non-human response, output [DISPOSITION:bad_number]

END OF CALL:
When the conversation ends (for any reason), output on a new line:
[DISPOSITION:disposition_code] [SUMMARY:one sentence summary]`.trim()

  return prompt
}

/**
 * Get the appropriate opening script for a lead source without full prompt.
 */
export function getOpeningScript(leadSource: string, promptVersion: VoicePromptVersion): string {
  const openings: Record<string, string | null> = {
    purchased: promptVersion.opening_purchased,
    facebook:  promptVersion.opening_facebook,
    inbound:   promptVersion.opening_inbound,
    other:     promptVersion.opening_other,
  }
  return openings[leadSource] ?? openings.other ?? 'Hi, this is Sarah from SourcifyLending.'
}

/**
 * Build a follow-up SMS message.
 */
export function buildSmsMessage(params: {
  leadName:    string
  analyzerUrl: string
  template:    string
}): string {
  return params.template
    .replace('{{name}}',  params.leadName || 'there')
    .replace('{{link}}',  params.analyzerUrl)
    .replace('{{url}}',   params.analyzerUrl)
}

/**
 * Build a follow-up email body (plain HTML).
 */
export function buildEmailBody(params: {
  leadName:    string
  businessName: string
  analyzerUrl: string
}): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:#16a34a;padding:24px 32px;border-radius:12px 12px 0 0">
    <p style="color:#fff;font-size:18px;font-weight:700;margin:0">SourcifyLending</p>
    <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0 0">Business Credit Advisory Platform</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 12px 12px">
    <p style="font-size:15px;color:#374151">Hi ${params.leadName || 'there'},</p>
    <p style="font-size:14px;color:#4b5563;line-height:1.6">
      Thank you for speaking with us. As mentioned, here is the link to our free business credit analyzer:
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${params.analyzerUrl}" style="background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
        Run Free Business Credit Analyzer
      </a>
    </div>
    <p style="font-size:13px;color:#6b7280;line-height:1.6">
      The analyzer takes about 2 minutes and shows you exactly where your business stands with credit and funding readiness — no obligations.
    </p>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0">
    <p style="font-size:12px;color:#9ca3af">
      SourcifyLending is an advisory platform. We are not a lender and do not guarantee credit approvals or funding outcomes.
      <br>If you did not request this email, please disregard.
    </p>
  </div>
</div>`.trim()
}
