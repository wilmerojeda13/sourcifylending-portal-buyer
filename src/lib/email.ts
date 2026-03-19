/**
 * Email sending utility via Resend.
 * All emails go through this single module — keeps sender/config in one place.
 */
import { Resend } from 'resend'
import type { AnalyzerResult } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)

// Always use the verified subdomain — sourcifylending.com is NOT verified in Resend
const FROM_ADDRESS = 'SourcifyLending <no-reply@ai.sourcifylending.com>'
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sourcifylending.com'

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
    const { error } = await resend.emails.send({
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
    const { error } = await resend.emails.send({
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
