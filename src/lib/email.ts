/**
 * Email sending utility via Resend.
 * All emails go through this single module — keeps sender/config in one place.
 */
import { Resend } from 'resend'
import type { AnalyzerResult } from '@/types'

// Lazy-initialize so the constructor never runs at build time (no env vars available)
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

// Always use the verified subdomain — sourcifylending.com is NOT verified in Resend
const FROM_ADDRESS = 'SourcifyLending <no-reply@ai.sourcifylending.com>'
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sourcifylending.com'
export const DIALER_INTRO_EMAIL_SUBJECT = 'Set up your free SourcifyLending account'

const PROGRAM_LABELS: Record<string, string> = {
  program_a: 'Program A — 0% Intro APR Card Strategy',
  program_b: 'Program B — Business Credit Builder',
  program_c: 'Program C — Capital Monitoring Membership',
}

const PROGRAM_DESCRIPTIONS: Record<string, string> = {
  program_a: 'Access multiple 0% intro APR business cards to fund your business with no-interest capital.',
  program_b: 'Build a strong business credit profile under your EIN with tier-1 vendors and reporting tradelines.',
  program_c: 'Monthly credit monitoring, reporting cleanup, and readiness coaching to stay funding-ready.',
}

const READINESS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'Ready':               { bg: '#f0fdf4', text: '#15803d', label: '✅ Ready' },
  'Conditionally Ready': { bg: '#fefce8', text: '#a16207', label: '⚠️ Conditionally Ready' },
  'Not Ready':           { bg: '#fef2f2', text: '#b91c1c', label: '❌ Not Ready' },
}

export function buildDialerIntroEmailText() {
  return `Hello,

Here is the link to set up your free SourcifyLending account and run the free analyzer:

Portal:
https://app.sourcifylending.com/login

Free Analyzer:
https://app.sourcifylending.com/analyzer

The analyzer takes about 3 minutes and helps determine the best path based on your business profile.

Thank you,
SourcifyLending`
}

export async function sendDialerIntroEmail({
  toEmail,
}: {
  toEmail: string
}): Promise<{ success: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return { success: false, error: 'Email not configured' }
  }

  const text = buildDialerIntroEmailText()
  const html = text
    .split('\n\n')
    .map((paragraph) => `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('')

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject: DIALER_INTRO_EMAIL_SUBJECT,
        text,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:32px 16px;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="background:#16a34a;padding:24px 32px;">
        <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">SourcifyLending</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        ${html}
      </td>
    </tr>
  </table>
</body>
</html>`,
        tags: [
          { name: 'source', value: 'dialer_intro_email' },
          { name: 'recipient', value: toEmail },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: errorText || `Resend request failed with status ${response.status}` }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Analyzer Results Email ────────────────────────────────────────────────────
export async function sendAnalyzerResultEmail({
  toEmail,
  toName,
  result,
  leadId,
  businessName,
}: {
  toEmail: string
  toName: string
  result: AnalyzerResult
  leadId: string | null
  businessName?: string
}): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not set — skipping analyzer result email')
    return { success: false, error: 'Email not configured' }
  }

  const programLabel = PROGRAM_LABELS[result.assigned_program] ?? result.assigned_program
  const programDesc  = PROGRAM_DESCRIPTIONS[result.assigned_program] ?? ''
  const readiness    = READINESS_COLORS[result.readiness_status] ?? READINESS_COLORS['Not Ready']
  const firstName    = toName.split(' ')[0] || 'there'

  const riskFlagRows = result.risk_flags.length > 0
    ? result.risk_flags.map(f =>
        `<li style="padding:4px 0;color:#374151;font-size:14px;">⚠️ ${f}</li>`
      ).join('')
    : '<li style="padding:4px 0;color:#6b7280;font-size:14px;">No major risk flags identified.</li>'

  const signupUrl = `${SITE_URL}/analyzer`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Credit Readiness Analysis — SourcifyLending</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:#16a34a;padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:rgba(255,255,255,0.2);border-radius:10px;padding:8px 14px;display:inline-block;">
                    <span style="color:#ffffff;font-weight:800;font-size:18px;letter-spacing:-0.5px;">SL</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="color:#ffffff;font-weight:700;font-size:18px;">SourcifyLending</span>
                  </td>
                </tr>
              </table>
              <p style="color:#bbf7d0;font-size:13px;margin:12px 0 0 0;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">
                Your Credit Readiness Analysis
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0 40px;">
              <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:800;color:#111827;">
                Hi ${firstName}, your results are in! 🎯
              </h1>
              <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.6;">
                ${businessName
                  ? `We've analyzed <strong style="color:#111827;">${businessName}</strong>'s credit profile and have your personalized program recommendation below.`
                  : `We've analyzed your credit profile and have your personalized program recommendation below.`
                }
              </p>
            </td>
          </tr>

          <!-- Readiness Badge -->
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:${readiness.bg};border:1px solid ${readiness.text}33;border-radius:12px;padding:20px 24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:${readiness.text};">
                      Funding Readiness
                    </p>
                    <p style="margin:0;font-size:22px;font-weight:800;color:#111827;">
                      ${readiness.label}
                    </p>
                    ${result.summary ? `<p style="margin:10px 0 0 0;font-size:14px;color:#374151;line-height:1.6;">${result.summary}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Program Recommendation -->
          <tr>
            <td style="padding:16px 40px 0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:#16a34a;">
                      Recommended Program
                    </p>
                    <p style="margin:0 0 6px 0;font-size:18px;font-weight:800;color:#14532d;">
                      ${programLabel}
                    </p>
                    <p style="margin:0 0 10px 0;font-size:14px;color:#166534;line-height:1.6;">${programDesc}</p>
                    ${result.recommendation
                      ? `<p style="margin:0;font-size:13px;color:#15803d;font-style:italic;line-height:1.6;">&ldquo;${result.recommendation}&rdquo;</p>`
                      : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${result.risk_flags.length > 0 ? `
          <!-- Risk Flags -->
          <tr>
            <td style="padding:16px 40px 0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px 24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#92400e;">
                      Risk Factors to Address (${result.risk_flags.length})
                    </p>
                    <ul style="margin:0;padding:0 0 0 4px;list-style:none;">
                      ${riskFlagRows}
                    </ul>
                    <p style="margin:12px 0 0 0;font-size:12px;color:#a16207;">
                      These factors are addressed step-by-step inside your program roadmap.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- CTA -->
          <tr>
            <td style="padding:32px 40px;text-align:center;">
              <p style="margin:0 0 20px 0;font-size:16px;font-weight:700;color:#111827;">
                Ready to get started? Save your results and access your free portal.
              </p>
              <a href="${signupUrl}"
                style="display:inline-block;background:#16a34a;color:#ffffff;font-weight:700;font-size:15px;
                       padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.2px;">
                Create Free Account →
              </a>
              <p style="margin:16px 0 0 0;font-size:13px;color:#9ca3af;">
                No credit card required · Takes 30 seconds
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:12px;color:#9ca3af;line-height:1.6;">
                This analysis is for informational purposes only. SourcifyLending does not guarantee
                approvals, credit limits, or funding outcomes. Individual results vary.
              </p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">
                © ${new Date().getFullYear()} SourcifyLending · You're receiving this because you completed the free analyzer.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`

  try {
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: `Your Credit Readiness Analysis — ${result.readiness_status}`,
      html,
    })

    if (error) {
      console.error('[EMAIL] Resend error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[EMAIL] Unexpected send error:', msg)
    return { success: false, error: msg }
  }
}

// ─── Welcome Email (after account creation) ───────────────────────────────────
export async function sendWelcomeEmail({
  toEmail,
  toName,
  programLabel,
}: {
  toEmail: string
  toName: string
  programLabel: string
}): Promise<{ success: boolean }> {
  if (!process.env.RESEND_API_KEY) return { success: false }

  const firstName = toName.split(' ')[0] || 'there'
  const dashboardUrl = `${SITE_URL}/dashboard`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Welcome to SourcifyLending</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#16a34a;padding:32px 40px;text-align:center;">
              <span style="color:#ffffff;font-weight:800;font-size:22px;">SourcifyLending</span>
              <p style="color:#bbf7d0;font-size:13px;margin:8px 0 0 0;">Welcome to your portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:800;color:#111827;">
                Welcome, ${firstName}! 🎉
              </h1>
              <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.7;">
                Your free account is ready. You've been matched to <strong>${programLabel}</strong>.
              </p>
              <p style="margin:0 0 28px 0;color:#6b7280;font-size:14px;line-height:1.7;">
                Your prospect dashboard is live — you can see your readiness analysis, program recommendation,
                and what's waiting for you when you're ready to start.
              </p>
              <div style="text-align:center;">
                <a href="${dashboardUrl}"
                  style="display:inline-block;background:#16a34a;color:#ffffff;font-weight:700;font-size:15px;
                         padding:14px 36px;border-radius:12px;text-decoration:none;">
                  Go to My Dashboard →
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} SourcifyLending
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  try {
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: `Welcome to SourcifyLending — Your portal is ready`,
      html,
    })
    return { success: !error }
  } catch {
    return { success: false }
  }
}

// ─── Underwriting Complete Email ─────────────────────────────────────────────
export async function sendUnderwritingCompleteEmail({
  toEmail,
  toName,
  program,
  approvalLikelihood,
  riskLevel,
  aiSummary,
  aiRecommendations,
  estimatedFundingRange,
  determinedStage,
  keyIssues,
  reviewNumber = 1,
  riskScoreDelta = null,
  nextDueAt = null,
}: {
  toEmail: string
  toName: string
  program: string
  approvalLikelihood: 'high' | 'medium' | 'low' | 'disqualified'
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  aiSummary: string | null
  aiRecommendations: string[]
  estimatedFundingRange: string | null
  determinedStage: string | null
  keyIssues: string[]
  /** Which review number this is (1 = first review) */
  reviewNumber?: number
  /** risk_score_delta: positive = improvement (score went down) */
  riskScoreDelta?: number | null
  /** ISO string of next review due date */
  nextDueAt?: string | null
}): Promise<{ success: boolean }> {
  if (!process.env.RESEND_API_KEY) return { success: false }

  const firstName = (toName || 'Client').split(' ')[0]
  const dashboardUrl = `${SITE_URL}/dashboard`
  const isRenewal = reviewNumber > 1

  const programLabel = PROGRAM_LABELS[program] ?? program

  // Format next due date for display
  const nextDueDateLabel = nextDueAt
    ? new Date(nextDueAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  // Delta label: positive = improvement
  const deltaLabel = riskScoreDelta !== null && riskScoreDelta !== undefined
    ? riskScoreDelta > 0
      ? `↓ ${riskScoreDelta} pts improvement`
      : riskScoreDelta < 0
      ? `↑ ${Math.abs(riskScoreDelta)} pts increase`
      : 'No change'
    : null

  const outcomeConfig: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
    high:          { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Strong Approval Likelihood',             icon: '✅' },
    medium:        { bg: '#fefce8', border: '#fde68a', text: '#a16207', label: 'Moderate Approval Likelihood',           icon: '⚠️' },
    low:           { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', label: 'Lower Approval Likelihood — Action Required', icon: '🔶' },
    disqualified:  { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', label: 'Additional Steps Required',              icon: '🚧' },
  }
  const outcome = outcomeConfig[approvalLikelihood] ?? outcomeConfig.medium

  const recRows = aiRecommendations.length > 0
    ? aiRecommendations.map(r => `<li style="padding:5px 0;color:#374151;font-size:14px;">→ ${r}</li>`).join('')
    : ''

  const issueRows = keyIssues.length > 0
    ? keyIssues.map(i => `<li style="padding:4px 0;color:#374151;font-size:14px;">⚠️ ${i}</li>`).join('')
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Underwriting Review Complete — SourcifyLending</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- Header -->
        <tr>
          <td style="background:#16a34a;padding:32px 40px;text-align:center;">
            <span style="color:#ffffff;font-weight:800;font-size:22px;">SourcifyLending</span>
            <p style="color:#bbf7d0;font-size:13px;margin:8px 0 0 0;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">
              Underwriting Review Complete
            </p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 40px 0 40px;">
            ${isRenewal
              ? `<p style="margin:0 0 10px 0;display:inline-block;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:4px 10px;border-radius:20px;">
                  Monthly Review #${reviewNumber}
                </p>`
              : ''}
            <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:800;color:#111827;">
              Hi ${firstName}, your underwriting is done! 🎯
            </h1>
            <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.6;">
              ${isRenewal
                ? `Review #${reviewNumber} of your <strong style="color:#111827;">${programLabel}</strong> file is complete.`
                : `Your profile has been analyzed for <strong style="color:#111827;">${programLabel}</strong>.`}
              Here's your personalized underwriting summary.
            </p>
          </td>
        </tr>

        <!-- Outcome Badge -->
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:${outcome.bg};border:1px solid ${outcome.border};border-radius:12px;padding:20px 24px;">
              <tr>
                <td>
                  <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:${outcome.text};">
                    Underwriting Outcome
                  </p>
                  <p style="margin:0;font-size:22px;font-weight:800;color:#111827;">
                    ${outcome.icon} ${outcome.label}
                  </p>
                  <p style="margin:8px 0 0 0;font-size:13px;color:${outcome.text};font-weight:600;">
                    Risk Level: ${riskLevel}${estimatedFundingRange ? ' &nbsp;·&nbsp; Est. Funding: ' + estimatedFundingRange : ''}${determinedStage ? ' &nbsp;·&nbsp; Stage: ' + determinedStage : ''}
                  </p>
                  ${deltaLabel ? `<p style="margin:6px 0 0 0;font-size:12px;color:${riskScoreDelta !== null && riskScoreDelta! > 0 ? '#15803d' : riskScoreDelta! < 0 ? '#b91c1c' : '#6b7280'};font-weight:700;">
                    Risk Score vs. Last Review: ${deltaLabel}
                  </p>` : ''}
                  ${nextDueDateLabel ? `<p style="margin:6px 0 0 0;font-size:12px;color:#6b7280;">
                    Next review due: ${nextDueDateLabel}
                  </p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${aiSummary ? `
        <!-- AI Summary -->
        <tr>
          <td style="padding:16px 40px 0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;">
              <tr>
                <td>
                  <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">
                    AI Underwriting Summary
                  </p>
                  <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${aiSummary}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        ${recRows ? `
        <!-- Recommendations -->
        <tr>
          <td style="padding:16px 40px 0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;">
              <tr>
                <td>
                  <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#15803d;">
                    Your Next Steps
                  </p>
                  <ul style="margin:0;padding:0;list-style:none;">${recRows}</ul>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        ${issueRows ? `
        <!-- Key Issues -->
        <tr>
          <td style="padding:16px 40px 0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px 24px;">
              <tr>
                <td>
                  <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#92400e;">
                    Areas to Address (${keyIssues.length})
                  </p>
                  <ul style="margin:0;padding:0 0 0 4px;list-style:none;">${issueRows}</ul>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- CTA -->
        <tr>
          <td style="padding:32px 40px;text-align:center;">
            <p style="margin:0 0 20px 0;font-size:15px;font-weight:700;color:#111827;">
              Your funding plan is ready — head to your dashboard.
            </p>
            <a href="${dashboardUrl}"
              style="display:inline-block;background:#16a34a;color:#ffffff;font-weight:700;font-size:15px;
                     padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.2px;">
              Go to My Dashboard →
            </a>
          </td>
        </tr>

        <!-- Legal Footer -->
        <tr>
          <td style="padding:0 40px 24px 40px;border-top:1px solid #e5e7eb;padding-top:24px;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;text-align:center;">
              All recommendations are based on the information you provided during your profile analysis.
              SourcifyLending does not guarantee approvals, credit limits, or funding outcomes. Individual results vary.
              © ${new Date().getFullYear()} SourcifyLending
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: isRenewal
        ? `Monthly Review #${reviewNumber} Complete — SourcifyLending`
        : `Your Underwriting Review is Complete — SourcifyLending`,
      html,
    })
    return { success: !error }
  } catch {
    return { success: false }
  }
}

// ─── Payment Reminder Email ────────────────────────────────────────────────────
export type PaymentReminderType = 'balance_due' | 'arrangement_due' | 'renewal_upcoming' | 'past_due'

export async function sendPaymentReminderEmail({
  toEmail,
  toName,
  reminderType,
  amountDue,
  balanceRemaining,
  dueDate,
  recurringAmount,
  programLabel,
  notes,
}: {
  toEmail: string
  toName: string
  reminderType: PaymentReminderType
  amountDue?: number
  balanceRemaining?: number
  dueDate?: string
  recurringAmount?: number
  programLabel?: string
  notes?: string
}): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { success: false, error: 'Email not configured' }

  const firstName = (toName || 'Client').split(' ')[0]
  const billingUrl = `${SITE_URL}/billing`
  const program = programLabel ?? 'SourcifyLending Membership'

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const daysUntil = dueDate
    ? Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  type Cfg = { subject: string; headerColor: string; headerLabel: string; badgeBg: string; badgeBorder: string; badgeText: string; badgeLabel: string; icon: string; headline: string; body: string; ctaText: string }
  const configs: Record<PaymentReminderType, Cfg> = {
    past_due: {
      subject: '⚠️ Action Required: Payment Past Due — SourcifyLending',
      headerColor: '#b91c1c', headerLabel: 'Payment Past Due',
      badgeBg: '#fef2f2', badgeBorder: '#fca5a5', badgeText: '#b91c1c',
      badgeLabel: '⚠️ Payment Overdue',
      icon: '⚠️', headline: `Action required, ${firstName}`,
      body: `Your subscription payment for <strong>${program}</strong> is past due. To avoid a service interruption, please update your payment method or contact us right away.`,
      ctaText: 'Update Payment Method',
    },
    balance_due: {
      subject: `Balance Due${amountDue ? ` — ${fmt(amountDue)}` : ''} — SourcifyLending`,
      headerColor: '#b45309', headerLabel: 'Payment Reminder',
      badgeBg: '#fffbeb', badgeBorder: '#fde68a', badgeText: '#92400e',
      badgeLabel: `💳 Balance Due${amountDue ? `: ${fmt(amountDue)}` : ''}`,
      icon: '💳', headline: `You have a remaining balance, ${firstName}`,
      body: `Your <strong>${program}</strong> account has an outstanding setup fee balance${balanceRemaining ? ` of <strong>${fmt(balanceRemaining)}</strong>` : ''}${dueDate ? ` due on <strong>${fmtDate(dueDate)}</strong>` : ''}. Please ensure payment is made to keep your account in good standing.`,
      ctaText: 'View Payment Details',
    },
    arrangement_due: {
      subject: `Payment Due${dueDate ? ` ${fmtDate(dueDate)}` : ''} — SourcifyLending`,
      headerColor: '#b45309', headerLabel: 'Upcoming Payment',
      badgeBg: '#fffbeb', badgeBorder: '#fde68a', badgeText: '#92400e',
      badgeLabel: `📅 Payment Due${daysUntil !== null ? ` in ${daysUntil} Day${daysUntil !== 1 ? 's' : ''}` : ''}`,
      icon: '📅', headline: `Upcoming payment reminder, ${firstName}`,
      body: `Your next scheduled payment${amountDue ? ` of <strong>${fmt(amountDue)}</strong>` : ''} for <strong>${program}</strong> is due${dueDate ? ` on <strong>${fmtDate(dueDate)}</strong>` : ' soon'}. Please make sure your payment method is ready.`,
      ctaText: 'View Payment Schedule',
    },
    renewal_upcoming: {
      subject: 'Your Membership Renews Soon — SourcifyLending',
      headerColor: '#16a34a', headerLabel: 'Renewal Notice',
      badgeBg: '#f0fdf4', badgeBorder: '#bbf7d0', badgeText: '#15803d',
      badgeLabel: `🔄 Renews${daysUntil !== null ? ` in ${daysUntil} Day${daysUntil !== 1 ? 's' : ''}` : ' Soon'}`,
      icon: '🔄', headline: `Your membership renews soon, ${firstName}`,
      body: `Your <strong>${program}</strong> subscription renews${dueDate ? ` on <strong>${fmtDate(dueDate)}</strong>` : ' soon'}${recurringAmount ? ` for <strong>${fmt(recurringAmount)}/month</strong>` : ''}. Your card on file will be charged automatically — no action needed unless you want to make changes.`,
      ctaText: 'Manage Subscription',
    },
  }

  const c = configs[reminderType]

  const summaryRows = [
    balanceRemaining ? `<tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Balance Remaining</td><td style="font-size:13px;font-weight:700;color:#111827;text-align:right;">${fmt(balanceRemaining)}</td></tr>` : '',
    amountDue        ? `<tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Amount Due</td><td style="font-size:13px;font-weight:700;color:#111827;text-align:right;">${fmt(amountDue)}</td></tr>` : '',
    recurringAmount  ? `<tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Monthly Rate</td><td style="font-size:13px;font-weight:700;color:#111827;text-align:right;">${fmt(recurringAmount)}/mo</td></tr>` : '',
    dueDate          ? `<tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">${reminderType === 'renewal_upcoming' ? 'Renewal Date' : 'Due Date'}</td><td style="font-size:13px;font-weight:700;color:#111827;text-align:right;">${fmtDate(dueDate)}</td></tr>` : '',
  ].filter(Boolean).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${c.subject}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${c.headerColor};padding:28px 40px;text-align:center;">
        <span style="color:#ffffff;font-weight:800;font-size:22px;">SourcifyLending</span>
        <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:6px 0 0 0;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">${c.headerLabel}</p>
      </td></tr>
      <tr><td style="padding:32px 40px 0 40px;">
        <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#111827;">${c.icon} ${c.headline}</h1>
      </td></tr>
      <tr><td style="padding:20px 40px 0 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${c.badgeBg};border:1px solid ${c.badgeBorder};border-radius:12px;padding:20px 24px;">
          <tr><td>
            <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:${c.badgeText};">Payment Notice</p>
            <p style="margin:0 0 10px 0;font-size:20px;font-weight:800;color:#111827;">${c.badgeLabel}</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${c.body}</p>
            ${notes ? `<p style="margin:12px 0 0 0;font-size:13px;color:#6b7280;font-style:italic;">${notes}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>
      ${summaryRows ? `
      <tr><td style="padding:16px 40px 0 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 24px;">
          <tr><td>
            <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Payment Summary</p>
            <table width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>
          </td></tr>
        </table>
      </td></tr>` : ''}
      <tr><td style="padding:32px 40px;text-align:center;">
        <a href="${billingUrl}" style="display:inline-block;background:${c.headerColor};color:#ffffff;font-weight:700;font-size:15px;padding:14px 36px;border-radius:12px;text-decoration:none;">${c.ctaText} →</a>
        <p style="margin:16px 0 0 0;font-size:13px;color:#9ca3af;">Questions? Reply to this email or contact your advisor.</p>
      </td></tr>
      <tr><td style="padding:0 40px 24px 40px;border-top:1px solid #e5e7eb;padding-top:20px;">
        <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;text-align:center;">
          Automated payment reminder from SourcifyLending.<br/>© ${new Date().getFullYear()} SourcifyLending
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  try {
    const { error } = await getResend().emails.send({ from: FROM_ADDRESS, to: toEmail, subject: c.subject, html })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Welcome Agreement Confirmation Email ─────────────────────────────────────
export async function sendWelcomeAgreementConfirmation({
  toEmail,
  toName,
  signedName,
  agreementVersion,
  programLabel,
  signedAt,
  ipAddress,
}: {
  toEmail: string
  toName: string
  signedName: string
  agreementVersion: string
  programLabel: string
  signedAt: string
  ipAddress: string
}): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { success: false, error: 'Email not configured' }

  const firstName = toName.split(' ')[0] || 'there'
  const formattedDate = new Date(signedAt).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:#1d4ed8;padding:32px 40px;text-align:center;">
        <p style="margin:0;color:#bfdbfe;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">SourcifyLending</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Service Agreement Signed</h1>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${firstName},</p>
        <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
          This email confirms that you have signed the SourcifyLending Service Agreement for your <strong>${programLabel}</strong> portal access. Your electronic signature has been securely recorded.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;margin:0 0 24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;">Agreement Details</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:13px;width:40%;">Signed Name</td>
                <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:600;">${signedName}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:13px;">Agreement Version</td>
                <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:600;">${agreementVersion}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:13px;">Date &amp; Time</td>
                <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:600;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:13px;">IP Address</td>
                <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:600;">${ipAddress}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:13px;">Program</td>
                <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:600;">${programLabel}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin:0 0 24px;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:#991b1b;font-weight:600;">No-Refund Policy Acknowledged</p>
            <p style="margin:6px 0 0;font-size:13px;color:#b91c1c;line-height:1.5;">
              By signing this agreement, you confirmed that all payments are non-refundable once portal access is granted, and that you agree to contact SourcifyLending directly at support@sourcifylending.com before initiating any dispute.
            </p>
          </td></tr>
        </table>

        <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
          Keep this email for your records. If you have any questions about your agreement or services, contact us at <a href="mailto:support@sourcifylending.com" style="color:#1d4ed8;">support@sourcifylending.com</a>.
        </p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} SourcifyLending · All rights reserved</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  try {
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: 'Service Agreement Signed — SourcifyLending',
      html,
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Charge Confirmation Email ─────────────────────────────────────────────────
export async function sendChargeConfirmationEmail({
  toEmail,
  toName,
  amountPaid,
  programLabel,
  invoiceId,
  billingDate,
  deliverables,
}: {
  toEmail: string
  toName: string
  amountPaid: number
  programLabel: string
  invoiceId: string
  billingDate: string
  deliverables: Array<{ title: string; description?: string }>
}): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { success: false, error: 'Email not configured' }

  const firstName = toName.split(' ')[0] || 'there'
  const formattedDate = new Date(billingDate).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const formattedAmount = `$${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  const deliverableRows = deliverables.length > 0
    ? deliverables.map(d => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#111827;">✓ ${d.title}</p>
            ${d.description ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${d.description}</p>` : ''}
          </td>
        </tr>`).join('')
    : `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Portal access, AI guidance, and progress tracking services — available 24/7 in your dashboard.</td></tr>`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:#15803d;padding:32px 40px;text-align:center;">
        <p style="margin:0;color:#bbf7d0;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">SourcifyLending</p>
        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Payment Confirmation</h1>
        <p style="margin:8px 0 0;color:#bbf7d0;font-size:28px;font-weight:800;">${formattedAmount}</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${firstName},</p>
        <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
          Your payment of <strong>${formattedAmount}</strong> for your <strong>${programLabel}</strong> membership has been processed successfully on ${formattedDate}.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin:0 0 24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Payment Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
              <tr>
                <td style="padding:3px 0;color:#6b7280;font-size:13px;width:40%;">Amount Charged</td>
                <td style="padding:3px 0;color:#111827;font-size:13px;font-weight:700;">${formattedAmount}</td>
              </tr>
              <tr>
                <td style="padding:3px 0;color:#6b7280;font-size:13px;">Date</td>
                <td style="padding:3px 0;color:#111827;font-size:13px;font-weight:600;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding:3px 0;color:#6b7280;font-size:13px;">Program</td>
                <td style="padding:3px 0;color:#111827;font-size:13px;font-weight:600;">${programLabel}</td>
              </tr>
              <tr>
                <td style="padding:3px 0;color:#6b7280;font-size:13px;">Invoice ID</td>
                <td style="padding:3px 0;color:#111827;font-size:12px;font-family:monospace;">${invoiceId}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#111827;">Services Delivered This Period</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          ${deliverableRows}
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;margin:0 0 24px;">
          <tr><td style="padding:14px 18px;">
            <p style="margin:0;font-size:12px;color:#92400e;line-height:1.5;">
              <strong>Per your signed service agreement</strong>, all payments are non-refundable once portal access is granted. If you have questions about your service, contact us at <a href="mailto:support@sourcifylending.com" style="color:#92400e;">support@sourcifylending.com</a> before initiating any dispute.
            </p>
          </td></tr>
        </table>

        <div style="text-align:center;">
          <a href="${SITE_URL}/dashboard" style="display:inline-block;background:#15803d;color:#ffffff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;">
            Go to My Dashboard →
          </a>
        </div>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} SourcifyLending · All rights reserved</p>
        <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">This is a payment receipt. Please keep it for your records.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  try {
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: `Payment Confirmed — ${formattedAmount} · SourcifyLending`,
      html,
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
