import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const DAILY_INVITE_LIMIT = 20
const MAX_RESENDS_PER_LEAD = 3

async function getAffiliate() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, name, email, referral_code, status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!affiliate || affiliate.status === 'suspended') return null
  return { user, affiliate, supabase }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getAffiliate()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { affiliate, supabase } = ctx

  const leadId = params.id

  // Fetch the lead (must belong to this affiliate)
  const { data: lead } = await supabase
    .from('affiliate_leads')
    .select('*')
    .eq('id', leadId)
    .eq('affiliate_id', affiliate.id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Block if lead already has an account
  if (lead.status === 'account_created' || lead.status === 'active') {
    return NextResponse.json({ error: 'This lead already has an account.' }, { status: 409 })
  }

  // Resend limit per lead
  if ((lead.invite_sent_count ?? 0) >= MAX_RESENDS_PER_LEAD) {
    return NextResponse.json({
      error: `Maximum of ${MAX_RESENDS_PER_LEAD} invites already sent to this lead.`,
    }, { status: 429 })
  }

  // Daily invite limit per affiliate
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: dailyCount } = await supabase
    .from('affiliate_leads')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', affiliate.id)
    .gte('invite_sent_at', since)

  if ((dailyCount ?? 0) >= DAILY_INVITE_LIMIT) {
    return NextResponse.json({
      error: `Daily invite limit of ${DAILY_INVITE_LIMIT} reached. Try again tomorrow.`,
    }, { status: 429 })
  }

  // Verify email still isn't a platform user (re-check in case they signed up since lead was created)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', lead.email)
    .maybeSingle()

  if (existingProfile) {
    // Update lead to account_created status automatically
    await supabase.from('affiliate_leads').update({
      status: 'account_created',
      account_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)

    return NextResponse.json({
      error: 'This prospect has already created an account. Their lead status has been updated.',
    }, { status: 409 })
  }

  // Build invite link
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sourcifylending.com'
  const inviteLink = `${baseUrl}/signup?ref=${affiliate.referral_code}&lead=${leadId}`

  // Send email via Resend
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const dealLabel = lead.deal_type === 'referral_only' ? 'partner introduction' : 'partner-assisted onboarding'
  const emailHtml = buildInviteEmail(affiliate.name, lead.full_name, inviteLink, dealLabel)

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SourcifyLending <no-reply@ai.sourcifylending.com>',
      to: [lead.email],
      subject: `${affiliate.name} invited you to SourcifyLending`,
      html: emailHtml,
    }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    console.error('[invite-email] Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 500 })
  }

  // Update lead record
  await supabase.from('affiliate_leads').update({
    status: 'invite_sent',
    invite_sent_at: new Date().toISOString(),
    invite_sent_count: (lead.invite_sent_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', leadId)

  return NextResponse.json({ ok: true, invite_link: inviteLink })
}

function buildInviteEmail(affiliateName: string, leadName: string, inviteLink: string, _dealLabel: string): string {
  const firstName = leadName.split(' ')[0] || leadName
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited to SourcifyLending</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#16a34a;padding:28px 36px;border-radius:12px 12px 0 0;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="background:rgba(255,255,255,0.2);width:36px;height:36px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
                  <span style="color:#fff;font-weight:800;font-size:14px;">SL</span>
                </div>
                <span style="color:#fff;font-weight:700;font-size:18px;vertical-align:middle;">SourcifyLending</span>
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hi ${firstName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                <strong style="color:#111827;">${affiliateName}</strong> invited you to join SourcifyLending through a partner-assisted onboarding path. They will help close, onboard, and support your account inside the platform.
              </p>

              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">What you'll get access to</p>
                <ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.8;">
                  <li>Business funding programs tailored to your situation</li>
                  <li>Partner-guided onboarding and implementation help</li>
                  <li>A transparent dashboard to track your progress</li>
                </ul>
              </div>

              <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;">
                Creating an account takes less than a minute. Your partner-assisted pricing and onboarding path will be shown clearly before payment.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteLink}"
                       style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.01em;">
                      Create Your Free Account →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                If you weren't expecting this invitation or have questions, you can safely ignore this email.<br>
                This link was shared by ${affiliateName} as part of the SourcifyLending Partner Program.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                SourcifyLending · Business Funding Platform<br>
                You received this because ${affiliateName} shared your contact information with us.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
