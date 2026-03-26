/**
 * 30-day free user nurture sequence.
 * 11 emails designed to convert prospects → paid members.
 */

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sourcifylending.com'
const FROM = 'SourcifyLending <no-reply@ai.sourcifylending.com>'

export interface NurtureEmail {
  day: number
  subject: string
  previewText: string
  html: (opts: { name: string; unsubscribeUrl: string }) => string
}

function baseTemplate({
  name,
  subject,
  headerColor = '#16a34a',
  body,
  ctaText,
  ctaUrl,
  unsubscribeUrl,
}: {
  name: string
  subject: string
  headerColor?: string
  body: string
  ctaText: string
  ctaUrl: string
  unsubscribeUrl: string
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Header -->
  <tr><td style="background:${headerColor};border-radius:12px 12px 0 0;padding:28px 36px">
    <p style="margin:0;color:#fff;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;opacity:.8">SourcifyLending</p>
    <p style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.3">${subject}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fff;padding:36px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
    <p style="margin:0 0 20px;font-size:15px;color:#374151">Hi ${name},</p>
    ${body}
    <div style="text-align:center;margin:32px 0">
      <a href="${ctaUrl}" style="background:#16a34a;color:#fff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;display:inline-block">${ctaText}</a>
    </div>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:20px">
      — The Sourcify Team<br/>
      <a href="https://app.sourcifylending.com" style="color:#16a34a;text-decoration:none">app.sourcifylending.com</a>
    </p>
    <p style="margin:12px 0 0;font-size:11px;color:#9ca3af">
      You're receiving this because you created a free Sourcify account.<br/>
      <a href="${unsubscribeUrl}" style="color:#9ca3af">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

export const NURTURE_SEQUENCE: NurtureEmail[] = [
  // ── Day 1 ──────────────────────────────────────────────────────────────────
  {
    day: 1,
    subject: 'Your portal is ready — here\'s your first move',
    previewText: 'One action today can change your funding outcome.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'Your portal is ready', unsubscribeUrl,
      ctaText: 'Open My Portal →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Your Sourcify account is live and your credit profile is being built. The fastest way to get value right now is a quick conversation with your AI credit agent.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Ask it anything — <em>"What's the fastest way to improve my credit score?"</em> or <em>"How do I qualify for 0% APR business cards?"</em> — and it'll give you a personalized answer based on your profile.</p>
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">
          <p style="margin:0;font-size:14px;color:#15803d;font-weight:600">Your 3 starter actions:</p>
          <p style="margin:8px 0 0;font-size:14px;color:#374151">1. Complete your profile in Settings<br/>2. Chat with your AI agent<br/>3. Review your recommended program</p>
        </div>
      `,
    }),
  },

  // ── Day 3 ──────────────────────────────────────────────────────────────────
  {
    day: 3,
    subject: 'What is 0% APR business funding — and why it works',
    previewText: 'Most business owners don\'t know this exists.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: '0% APR Funding Explained', unsubscribeUrl,
      ctaText: 'See My Recommended Program →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">0% intro APR business credit cards are one of the most underused tools in small business finance. Here's the concept in plain English:</p>
        <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin:16px 0">
          <p style="margin:0 0 12px;font-size:14px;color:#374151"><strong>How it works:</strong> Certain business cards offer 0% APR for 12–21 months. Stack 3–5 of these strategically and you can access $50k–$150k in interest-free capital.</p>
          <p style="margin:0;font-size:14px;color:#374151"><strong>The catch:</strong> You need a solid personal credit profile (680+ FICO) and the right application strategy — wrong order or wrong timing tanks your score.</p>
        </div>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">That's exactly what Program A does — we map out the right cards, the right order, and the right timing for your specific profile.</p>
      `,
    }),
  },

  // ── Day 5 ──────────────────────────────────────────────────────────────────
  {
    day: 5,
    subject: '5 things silently hurting your credit approval odds',
    previewText: 'Most people don\'t know #3 even counts against them.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: '5 Credit Killers to Fix Now', unsubscribeUrl,
      ctaText: 'Check My Credit Profile →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 20px;font-size:15px;color:#374151">These five factors quietly destroy approval odds — even for people with "decent" credit:</p>
        ${['High utilization (above 30%) — Lenders see this as a red flag even if you pay in full every month. Get below 10% before applying.',
          'Recent hard inquiries — Each application is a ding. Too many in a short window signals desperation to lenders.',
          'No business credit profile — A personal score above 720 doesn\'t help if you have zero PAYDEX score. Lenders want both.',
          'Thin credit file — Fewer than 5 open accounts? That\'s not enough history to score well on business applications.',
          'Wrong application order — Applying to Chase before Amex? That\'s a common mistake that burns your approval chances.'].map((item, i) => `
          <div style="display:flex;align-items:flex-start;margin-bottom:14px">
            <span style="background:#16a34a;color:#fff;font-size:12px;font-weight:700;min-width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:12px;margin-top:2px">${i + 1}</span>
            <p style="margin:0;font-size:14px;color:#374151">${item}</p>
          </div>`).join('')}
      `,
    }),
  },

  // ── Day 7 ──────────────────────────────────────────────────────────────────
  {
    day: 7,
    subject: 'Your AI agent is ready — here\'s what it can tell you',
    previewText: 'Available 24/7, trained on your profile.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'Your AI Credit Agent', unsubscribeUrl,
      ctaText: 'Chat With My Agent →', ctaUrl: `${SITE_URL}/agent`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Most credit questions go unanswered for days. Your AI agent can answer in seconds — and it knows your specific profile.</p>
        <p style="margin:0 0 16px;font-size:14px;color:#6b7280">Try asking it:</p>
        <div style="background:#f9fafb;border-radius:10px;padding:4px 0;margin:0 0 20px">
          ${['"What\'s my readiness score and how can I improve it?"',
            '"Which business cards should I apply for first?"',
            '"How long will it take to build my PAYDEX to 80?"',
            '"What derogatory marks are hurting me most?"'].map(q => `
            <div style="padding:12px 20px;border-bottom:1px solid #e5e7eb">
              <p style="margin:0;font-size:14px;color:#374151;font-style:italic">${q}</p>
            </div>`).join('')}
        </div>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">No fluff, no generic advice — it pulls from your actual credit profile and program data.</p>
      `,
    }),
  },

  // ── Day 10 ─────────────────────────────────────────────────────────────────
  {
    day: 10,
    subject: 'Program A: How clients access $50k–$150k at 0% interest',
    previewText: 'A step-by-step breakdown of what happens after you enroll.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'Program A — Explained', unsubscribeUrl,
      ctaText: 'Explore Program A →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Here's exactly what happens when a client joins Program A:</p>
        ${[['Profile Review', 'We analyze your credit profile — scores, utilization, inquiries, derogatory marks, and history.'],
          ['Card Strategy', 'We identify the exact cards with 0% intro APR that match your profile and build your application sequence.'],
          ['Application Timing', 'You apply in the right order, with the right spacing to maximize approvals and total credit limit.'],
          ['Capital in Hand', 'Clients typically access $50k–$150k in 0% APR credit lines within 30–60 days of starting the program.'],
          ['Ongoing Support', 'Your AI agent and Sourcify team support you throughout — disputes, strategy adjustments, and next steps.']].map(([title, desc], i) => `
          <div style="display:flex;align-items:flex-start;margin-bottom:16px">
            <div style="background:#16a34a;color:#fff;font-size:12px;font-weight:700;min-width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:14px;margin-top:2px">${i + 1}</div>
            <div><p style="margin:0;font-size:14px;font-weight:600;color:#111827">${title}</p><p style="margin:4px 0 0;font-size:14px;color:#6b7280">${desc}</p></div>
          </div>`).join('')}
      `,
    }),
  },

  // ── Day 13 ─────────────────────────────────────────────────────────────────
  {
    day: 13,
    subject: 'Program B: Build fundable business credit from scratch',
    previewText: 'PAYDEX 80+, Experian business score — here\'s how it\'s done.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'Program B — Business Credit Builder', unsubscribeUrl,
      ctaText: 'Explore Program B →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">If you want to borrow money <em>under your business EIN</em> — without a personal guarantee — you need a business credit profile. Most businesses have zero. Here's how Program B changes that:</p>
        <div style="background:#f9fafb;border-radius:10px;padding:20px 24px;margin:0 0 20px">
          <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#111827">The 3 business credit bureaus you need to build:</p>
          <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Dun & Bradstreet</strong> — PAYDEX score (0–100). Target: 80+.</p>
          <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Experian Business</strong> — Intelliscore Plus (0–100). Target: 76+.</p>
          <p style="margin:0;font-size:14px;color:#374151"><strong>Equifax Business</strong> — Payment Index. Target: 90+.</p>
        </div>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Program B gets you there using tier-1 vendor tradelines that report monthly. Most clients see their first reportable scores within 60–90 days.</p>
      `,
    }),
  },

  // ── Day 16 ─────────────────────────────────────────────────────────────────
  {
    day: 16,
    subject: 'Credit tip: The 30% utilization rule is a myth',
    previewText: 'The real number that gets approvals: under 10%.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'The Real Utilization Rule', unsubscribeUrl,
      ctaText: 'Open My Portal →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">You've probably heard "keep your credit utilization under 30%." That's fine for maintaining a decent score. But if you want <em>high-limit approvals</em>, you need to aim much lower.</p>
        <div style="background:#fefce8;border-left:4px solid #ca8a04;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0">
          <p style="margin:0;font-size:14px;color:#92400e;font-weight:600">The real number: Under 10%</p>
          <p style="margin:8px 0 0;font-size:14px;color:#374151">Premium card issuers (Chase, Amex, Citi) look for utilization under 10% — especially for business cards with $20k+ limits. At 29% you might squeak by. At 8%, you're getting the best terms.</p>
        </div>
        <p style="margin:0 0 16px;font-size:15px;color:#374151"><strong>Quick win:</strong> Pay down your highest utilization cards before applying. Even dropping from 25% to 8% on one card can push your score 20–40 points.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Your AI agent can tell you exactly which cards to pay down first based on your current balances.</p>
      `,
    }),
  },

  // ── Day 19 ─────────────────────────────────────────────────────────────────
  {
    day: 19,
    subject: 'What actually happens after you upgrade',
    previewText: 'No mystery, no pressure — here\'s the full process.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'What Happens When You Upgrade', unsubscribeUrl,
      ctaText: 'See Program Options →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">A lot of people hesitate because they're not sure what they're getting into. Here's the full picture — no surprises.</p>
        ${[['Day 1 after upgrade', 'Your advisor reviews your credit profile in full. You get a personalized action plan within 24 hours.'],
          ['Week 1', 'You execute the first phase — whether that\'s credit cleanup, tradeline setup, or card applications depending on your program.'],
          ['Days 7–30', 'Regular check-ins with your AI agent. Track your score changes in real time inside the portal.'],
          ['Month 2+', 'Continued execution and strategy adjustments. Most clients see measurable results within 60 days.'],
          ['Ongoing', 'You\'re never dropped. As long as you\'re enrolled, you have full access to your agent, dashboard, and advisor support.']].map(([phase, desc]) => `
          <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #f3f4f6">
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.5px">${phase}</p>
            <p style="margin:0;font-size:14px;color:#374151">${desc}</p>
          </div>`).join('')}
      `,
    }),
  },

  // ── Day 22 ─────────────────────────────────────────────────────────────────
  {
    day: 22,
    subject: 'The 3 reasons people wait — and why they regret it',
    previewText: 'Honest talk about the real cost of waiting.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'The Cost of Waiting', unsubscribeUrl,
      ctaText: 'Get Started Today →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">We hear these three things constantly from people who waited too long:</p>
        ${[['"I wanted to wait until my credit was better first."',
            'Your credit doesn\'t improve on its own. It improves through a strategy. Every month you wait is a month of no progress.'],
          ['"I wasn\'t sure if I was ready."',
            'That\'s exactly what the readiness assessment is for. Half the people who think they\'re not ready, are. Your portal already has your answer.'],
          ['"I thought I could figure it out myself."',
            'You can — and it might take 12–18 months of trial and error. Or you can use a system that\'s already dialed in.']].map(([quote, response]) => `
          <div style="background:#f9fafb;border-radius:10px;padding:18px 20px;margin-bottom:14px">
            <p style="margin:0 0 8px;font-size:14px;color:#374151;font-style:italic">${quote}</p>
            <p style="margin:0;font-size:14px;color:#6b7280">${response}</p>
          </div>`).join('')}
        <p style="margin:16px 0 0;font-size:15px;color:#374151">The best time to start was when you signed up. The second best time is today.</p>
      `,
    }),
  },

  // ── Day 26 ─────────────────────────────────────────────────────────────────
  {
    day: 26,
    subject: 'We limit enrollment to maintain quality — here\'s why',
    previewText: 'Each advisor handles a limited number of active clients.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'Why We Limit Enrollment', unsubscribeUrl,
      ctaText: 'Check Availability →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Sourcify isn't a software subscription you sign up for and never hear from again. When you enroll, a real advisor is assigned to your account.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">That means we cap the number of active clients we take on each month — not as a sales tactic, but because quality breaks down fast when advisors are spread too thin.</p>
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0">
          <p style="margin:0;font-size:14px;color:#15803d;font-weight:600">What you get when you upgrade:</p>
          <p style="margin:8px 0 0;font-size:14px;color:#374151">✓ Dedicated advisor assigned to your account<br/>✓ Full AI agent access with your credit data<br/>✓ Personalized card strategy or tradeline plan<br/>✓ Credit monitoring + dispute support<br/>✓ Ongoing access for as long as you're enrolled</p>
        </div>
        <p style="margin:16px 0 0;font-size:15px;color:#374151">Your free account keeps you in the queue. Upgrading moves you to the front.</p>
      `,
    }),
  },

  // ── Day 30 ─────────────────────────────────────────────────────────────────
  {
    day: 30,
    subject: 'This is our last email (unless you want to keep hearing from us)',
    previewText: 'Your free account stays active. We\'re just stopping the sequence.',
    html: ({ name, unsubscribeUrl }) => baseTemplate({
      name, subject: 'Last Message From Us', unsubscribeUrl,
      ctaText: 'Upgrade & Get Started →', ctaUrl: `${SITE_URL}/dashboard`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151">Over the past 30 days we've shared everything we know about building credit, accessing funding, and how our programs work.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">We're not going to keep emailing you if you're not ready. Your free account stays active — your portal, your AI agent, your credit tools are all still there.</p>
        <p style="margin:0 0 16px;font-size:15px;color:#374151">But if you're serious about accessing capital, building business credit, or cleaning up your personal credit profile — the next step is to upgrade.</p>
        <div style="background:#f9fafb;border-radius:10px;padding:18px 24px;margin:20px 0;text-align:center">
          <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827">Programs start at $297/mo</p>
          <p style="margin:0;font-size:14px;color:#6b7280">Cancel anytime. No contracts.</p>
        </div>
        <p style="margin:16px 0 0;font-size:15px;color:#374151">Whenever you're ready, your portal is waiting at <a href="${SITE_URL}/dashboard" style="color:#16a34a;text-decoration:none">app.sourcifylending.com</a>.</p>
      `,
    }),
  },
]

/**
 * Send a single nurture email via Resend.
 */
export async function sendNurtureEmail({
  toEmail,
  toName,
  dayNumber,
  unsubscribeToken,
}: {
  toEmail: string
  toName: string
  dayNumber: number
  unsubscribeToken: string
}): Promise<{ success: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { success: false, error: 'RESEND_API_KEY not set' }

  const email = NURTURE_SEQUENCE.find(e => e.day === dayNumber)
  if (!email) return { success: false, error: `No email for day ${dayNumber}` }

  const unsubscribeUrl = `${SITE_URL}/api/nurture/unsubscribe?token=${unsubscribeToken}`
  const firstName = toName.split(' ')[0] || toName

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [toEmail],
        subject: email.subject,
        html: email.html({ name: firstName, unsubscribeUrl }),
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
