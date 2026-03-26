/**
 * Paid user onboarding sequence.
 * Keeps active clients moving through their program — next steps,
 * underwriting reminders, milestone celebrations, and momentum builders.
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sourcifylending.com'
const FROM = 'SourcifyLending <no-reply@ai.sourcifylending.com>'

export interface OnboardingEmail {
  day: number
  subject: string
  html: (opts: { name: string; program: string; unsubscribeUrl: string }) => string
}

function base({
  name, subject, body, ctaText, ctaUrl, unsubscribeUrl, headerColor = '#16a34a',
}: {
  name: string; subject: string; body: string; ctaText: string; ctaUrl: string; unsubscribeUrl: string; headerColor?: string
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:${headerColor};border-radius:12px 12px 0 0;padding:28px 36px">
    <p style="margin:0;color:#fff;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;opacity:.8">SourcifyLending · Active Member</p>
    <p style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.3">${subject}</p>
  </td></tr>
  <tr><td style="background:#fff;padding:36px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
    <p style="margin:0 0 20px;font-size:15px;color:#374151">Hi ${name},</p>
    ${body}
    <div style="text-align:center;margin:32px 0">
      <a href="${ctaUrl}" style="background:#16a34a;color:#fff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;display:inline-block">${ctaText}</a>
    </div>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:20px">— The Sourcify Team<br/><a href="https://app.sourcifylending.com" style="color:#16a34a;text-decoration:none">app.sourcifylending.com</a></p>
    <p style="margin:12px 0 0;font-size:11px;color:#9ca3af">You're receiving this as an active Sourcify member.<br/><a href="${unsubscribeUrl}" style="color:#9ca3af">Unsubscribe from sequence emails</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

export const ONBOARDING_SEQUENCE: OnboardingEmail[] = [
  // ── Day 1: Welcome + first action ──────────────────────────────────────────
  {
    day: 1,
    subject: 'You\'re in — here\'s your exact first step',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: 'You\'re In — Here\'s Your First Step', unsubscribeUrl,
      ctaText: 'Complete My Profile →', ctaUrl: `${SITE_URL}/settings`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Welcome to Sourcify. Your account is now active and your advisor has been notified.</p>
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 20px">
          <p style="margin:0;font-size:14px;font-weight:600;color:#15803d">Your action right now (takes 5 minutes):</p>
          <p style="margin:8px 0 0;font-size:14px;color:#374151">Complete your profile in Settings — full legal name, business name, and EIN if applicable. Your advisor needs this to build your strategy.</p>
        </div>
        ${program === 'program_b' ? `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">For <strong>Program B</strong>, we'll also need your D-U-N-S number. If you don't have one, your advisor will walk you through getting it for free from Dun & Bradstreet — takes about 30 minutes.</p>
        ` : `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">For <strong>Program A</strong>, your advisor will pull a soft credit check to map out your card strategy. No hard inquiry yet — just a read of your current profile.</p>
        `}
        <p style="margin:0;font-size:15px;color:#374151">Expect a personalized action plan in your portal within 24 hours.</p>
      `,
    }),
  },

  // ── Day 3: Underwriting / profile review nudge ─────────────────────────────
  {
    day: 3,
    subject: 'We\'re reviewing your profile — here\'s what we\'re looking at',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: 'Your Profile Is Under Review', unsubscribeUrl,
      ctaText: 'View My Dashboard →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Your advisor is reviewing your credit profile right now. Here's exactly what they're evaluating:</p>
        <div style="background:#f9fafb;border-radius:10px;padding:4px 0;margin:0 0 20px">
          ${(program === 'program_b' ? [
            ['Business credit bureaus', 'D&B, Experian Business, Equifax Business — checking for existing scores or blank files'],
            ['EIN / Business entity', 'Verifying your LLC or Corp is properly set up and aged'],
            ['Vendor tradeline readiness', 'Identifying which tier-1 vendors you can apply to immediately'],
            ['D-U-N-S number', 'Confirming your DUNS is active and linked to your business address'],
          ] : [
            ['Personal FICO score', 'Experian, TransUnion, Equifax — all 3 bureaus reviewed'],
            ['Credit utilization', 'Checking utilization per card and overall — must be under 10% for best results'],
            ['Hard inquiry history', 'Timing your applications to avoid stacking too many inquiries'],
            ['Derogatory marks', 'Any collections, charge-offs, or late payments that need to be addressed first'],
          ]).map(([label, desc]) => `
            <div style="padding:12px 20px;border-bottom:1px solid #e5e7eb">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111827">${label}</p>
              <p style="margin:0;font-size:13px;color:#6b7280">${desc}</p>
            </div>`).join('')}
        </div>
        <p style="margin:0;font-size:15px;color:#374151">Your action plan will be posted to your portal dashboard. You'll see it as soon as it's ready.</p>
      `,
    }),
  },

  // ── Day 5: Check in — is everything moving? ────────────────────────────────
  {
    day: 5,
    subject: 'Quick check-in: have you seen your action plan yet?',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: 'Have You Seen Your Action Plan?', unsubscribeUrl,
      ctaText: 'Open My Dashboard →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Your personalized action plan should be visible in your dashboard by now. If you don't see it, reply to this email and we'll sort it out immediately.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">If you do see it — great. The most important thing is to follow the steps in the exact order listed. Here's why:</p>
        <div style="background:#fefce8;border-left:4px solid #ca8a04;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 20px">
          <p style="margin:0;font-size:14px;color:#92400e;font-weight:600">Order matters more than speed</p>
          <p style="margin:8px 0 0;font-size:14px;color:#374151">${program === 'program_b'
            ? 'Applying to tradeline vendors before your DUNS is active, or before your entity is properly set up, results in denials that are hard to reverse.'
            : 'Applying for the wrong card first — or applying when utilization is too high — can result in denials that linger on your report for 2 years.'
          }</p>
        </div>
        <p style="margin:0;font-size:15px;color:#374151">Your AI agent in the portal can answer any questions about the order or timeline.</p>
      `,
    }),
  },

  // ── Day 8: Underwriting complete / next milestone ─────────────────────────
  {
    day: 8,
    subject: 'Underwriting is complete — your next milestone is set',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: 'Underwriting Complete — What\'s Next', unsubscribeUrl,
      ctaText: 'View My Action Plan →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Your credit profile review is complete. Your advisor has mapped out your full strategy — it's live in your dashboard right now.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Here's a quick summary of what to expect over the next 30 days:</p>
        <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin:0 0 20px">
          ${(program === 'program_b' ? [
            ['Week 1', 'Set up net-30 vendor accounts that report to D&B — these become your first tradelines.'],
            ['Week 2–3', 'Apply to tier-2 vendors. First D&B scores typically appear within 30 days of first report.'],
            ['Week 4', 'Review initial PAYDEX score and prepare for tier-3 vendors.'],
            ['Day 60+', 'Target 80+ PAYDEX and begin business card applications under your EIN.'],
          ] : [
            ['Days 1–7', 'Pay down utilization per the plan. Do not apply to any cards yet.'],
            ['Days 7–14', 'Once utilization drops, apply to the first 2 cards in the exact order listed.'],
            ['Days 14–30', 'Space remaining applications 3–5 days apart. Monitor approvals in the portal.'],
            ['Day 30+', 'Review approved limits. Advisor will map out next round of applications.'],
          ]).map(([phase, desc]) => `
            <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #e5e7eb">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#16a34a">${phase}</p>
              <p style="margin:0;font-size:14px;color:#374151">${desc}</p>
            </div>`).join('')}
        </div>
        <p style="margin:0;font-size:15px;color:#374151">Questions? Chat with your AI agent any time — it has your full plan context.</p>
      `,
    }),
  },

  // ── Day 14: Two-week check-in ──────────────────────────────────────────────
  {
    day: 14,
    subject: 'Two weeks in — are you on track? Here\'s how to tell',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: 'Two-Week Check-In', unsubscribeUrl,
      ctaText: 'Check My Progress →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">You're two weeks in. Here's what you should have done by now — and what it means if you haven't:</p>
        <div style="background:#f9fafb;border-radius:10px;padding:4px 0;margin:0 0 20px">
          ${(program === 'program_b' ? [
            ['✓ D-U-N-S number active', 'If not done: this is blocking everything else. Do this today.'],
            ['✓ First net-30 accounts applied', 'If not done: your tradeline clock hasn\'t started yet.'],
            ['✓ Business entity verified', 'Name, address, and phone must match across all bureaus.'],
          ] : [
            ['✓ Utilization paid down', 'If not done: don\'t apply for any cards yet.'],
            ['✓ First card applications submitted', 'If not done: your 0% clock hasn\'t started yet.'],
            ['✓ Portal monitoring active', 'Check your scores in the Business Credit Monitoring section.'],
          ]).map(([label, action]) => `
            <div style="padding:12px 20px;border-bottom:1px solid #e5e7eb">
              <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827">${label}</p>
              <p style="margin:0;font-size:13px;color:#6b7280">${action}</p>
            </div>`).join('')}
        </div>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Behind on any of these? Don't stress — just open the portal and ask your AI agent the fastest way to catch up. It'll give you a specific answer for your situation.</p>
      `,
    }),
  },

  // ── Day 21: Momentum + score update prompt ─────────────────────────────────
  {
    day: 21,
    subject: 'Three weeks in — it\'s time to check your score',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: 'Check Your Score This Week', unsubscribeUrl,
      ctaText: 'Sync My Credit Score →', ctaUrl: `${SITE_URL}/${program === 'program_b' ? 'business-credit' : 'dashboard'}`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Three weeks in, your scores may have already started moving. This week you should pull an updated credit report and sync it to your portal.</p>
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 20px">
          <p style="margin:0;font-size:14px;font-weight:600;color:#15803d">How to sync your score:</p>
          <p style="margin:8px 0 0;font-size:14px;color:#374151">${program === 'program_b'
            ? '1. Log in to Nav.com → Dashboard\n2. Copy your credit report summary\n3. Go to Business Credit in your portal → "Sync Nav"\n4. Paste and confirm — your AI will extract all scores automatically'
            : '1. Log in to Credit Karma or Experian\n2. Your latest scores will be visible on the dashboard\n3. Note your TransUnion, Equifax, and Experian scores\n4. Log them in your portal for tracking'
          }</p>
        </div>
        <p style="margin:0;font-size:15px;color:#374151">Tracking your score changes is how you know the strategy is working — and where to adjust if something isn't moving.</p>
      `,
    }),
  },

  // ── Day 30: Month-one milestone ────────────────────────────────────────────
  {
    day: 30,
    subject: '30 days in — let\'s review your progress',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: '30-Day Progress Review', unsubscribeUrl, headerColor: '#1e40af',
      ctaText: 'Open My Progress Report →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">One month in. This is a big milestone — most clients see their first measurable results in this window.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Here's what a strong month-one looks like for your program:</p>
        <div style="background:#eff6ff;border-radius:10px;padding:20px 24px;margin:0 0 20px;border:1px solid #bfdbfe">
          ${(program === 'program_b' ? [
            '✓ D-U-N-S number active and linked',
            '✓ 2–3 net-30 vendor accounts applied and reporting',
            '✓ First PAYDEX score appearing (even if low)',
            '✓ Business entity verified across all 3 bureaus',
          ] : [
            '✓ Utilization under 10% on target cards',
            '✓ First 2–3 card applications submitted',
            '✓ At least 1 approval in hand',
            '✓ Credit score stable or improving',
          ]).map(item => `<p style="margin:0 0 8px;font-size:14px;color:#1e40af">${item}</p>`).join('')}
        </div>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">If you've hit most of these — you're right on track. If not, your AI agent can diagnose what to prioritize in month two.</p>
        <p style="margin:0;font-size:15px;color:#374151">Month two is where things accelerate. We'll be in touch with your next phase strategy soon.</p>
      `,
    }),
  },

  // ── Day 45: Keep momentum going ────────────────────────────────────────────
  {
    day: 45,
    subject: 'Month 2 update: where you should be right now',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: 'Month 2 — Keep the Momentum', unsubscribeUrl,
      ctaText: 'View My Next Steps →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">45 days in — this is where the real results start showing up. Here's your month-two focus:</p>
        <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin:0 0 20px">
          ${(program === 'program_b' ? [
            ['PAYDEX target', '60+ by now. If you\'re below 50, your net-30 accounts may not have reported yet — check your vendors.'],
            ['Tier-2 vendors', 'You should be adding your second tier of vendors this month — these have higher limits and report to Experian Business.'],
            ['Business credit monitoring', 'Pull your Nav report this week and sync it to your portal. Your AI will identify gaps.'],
          ] : [
            ['Second round of cards', 'If month-one approvals went well, your advisor will have a second application batch ready for you.'],
            ['0% window tracking', 'Log each card\'s intro period end date in the portal. You don\'t want to miss these.'],
            ['Total credit available', 'By now you should have a clear picture of total 0% capital available. Ask your agent for a summary.'],
          ]).map(([label, desc]) => `
            <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e5e7eb">
              <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827">${label}</p>
              <p style="margin:0;font-size:14px;color:#6b7280">${desc}</p>
            </div>`).join('')}
        </div>
        <p style="margin:0;font-size:15px;color:#374151">Stay consistent — the compounding effect of credit building kicks in hard in months 3 and 4.</p>
      `,
    }),
  },

  // ── Day 60: Two-month milestone ────────────────────────────────────────────
  {
    day: 60,
    subject: 'Two months in — most clients hit their first big win around now',
    html: ({ name, program, unsubscribeUrl }) => base({
      name, subject: '60-Day Milestone', unsubscribeUrl, headerColor: '#7c3aed',
      ctaText: 'View My Full Progress →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Two months in is when most clients report their first significant win. Here's what that typically looks like:</p>
        <div style="background:#faf5ff;border-radius:10px;padding:20px 24px;margin:0 0 20px;border:1px solid #e9d5ff">
          ${(program === 'program_b' ? [
            '🏆 First PAYDEX score of 70+ established',
            '🏆 2–3 vendors reporting monthly to D&B',
            '🏆 Experian Business Intelliscore appearing',
            '🏆 Ready to apply for first EIN-only business card',
          ] : [
            '🏆 $30k–$80k in approved 0% credit lines',
            '🏆 All card intro periods tracked and calendared',
            '🏆 Personal credit score maintained or improved',
            '🏆 Capital deployed into business (if applicable)',
          ]).map(item => `<p style="margin:0 0 10px;font-size:15px;color:#7c3aed;font-weight:500">${item}</p>`).join('')}
        </div>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Haven't hit these yet? Don't worry — every profile moves at a different speed. Open your portal and ask your agent "Where am I behind and what's the fastest way to catch up?"</p>
        <p style="margin:0;font-size:15px;color:#374151">You're doing the right things. Keep going.</p>
      `,
    }),
  },
]

/**
 * Send a single onboarding email via Resend.
 */
export async function sendOnboardingStepEmail({
  toEmail,
  toName,
  dayNumber,
  program,
  unsubscribeToken,
}: {
  toEmail: string
  toName: string
  dayNumber: number
  program: string
  unsubscribeToken: string
}): Promise<{ success: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { success: false, error: 'RESEND_API_KEY not set' }

  const email = ONBOARDING_SEQUENCE.find(e => e.day === dayNumber)
  if (!email) return { success: false, error: `No onboarding email for day ${dayNumber}` }

  const unsubscribeUrl = `${SITE_URL}/api/nurture/unsubscribe?token=${unsubscribeToken}&type=onboarding`
  const firstName = toName.split(' ')[0] || toName

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [toEmail],
        subject: email.subject,
        html: email.html({ name: firstName, program, unsubscribeUrl }),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      return { success: false, error: err }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
