// ─── Tracked Link Registry ────────────────────────────────────────────────────
// Each slug maps to a destination URL. All links go through /api/go/[slug]
// which logs user_id + timestamp + source before redirecting.

export const TRACKED_LINK_MAP: Record<string, string> = {
  // ── Bureau Registration ───────────────────────────────────────────────────
  'duns':           'https://www.dnb.com/duns-number/get-a-duns.html',
  'experian-biz':   'https://www.experian.com/small-business/business-credit-building.jsp',
  'equifax-biz':    'https://www.equifax.com/business/credit/',
  'nav':            'https://app.nav.com/',

  // ── Net-30 Vendors (report to D&B / Experian) ─────────────────────────────
  'uline':          'https://www.uline.com/BL_8567/Open-an-Account',
                    // reports to D&B within 30–60 days, no PG
  'quill':          'https://www.quill.com/store/s/credit-application',
                    // Staples-owned, reports to D&B + Experian
  'grainger':       'https://www.grainger.com/content/faq-NET30-account',
  'amazon-biz':     'https://business.amazon.com/en/find-your-solution/amazon-business-net-30',
  'staples':        'https://www.staplesadvantage.com',
  'home-depot':     'https://www.homedepot.com/c/homedepotcredit',
  'sams-club':      'https://www.samsclub.com/content/credit-account',
  'walmart-biz':    'https://business.walmart.com',
  'lowes':          'https://commercialaccount.lowes.com',
  'office-depot':   'https://www.officedepot.com/a/browse/business-account',
  'crown-office':   'https://crownofficetechnology.com/pages/net-30-account',
  'summa-office':   'https://summaofficesupplies.com/pages/net-30-account',
  'wise-biz':       'https://www.wiseofficesupply.com/pages/net-30-account',

  // ── Fleet / Gas Cards ─────────────────────────────────────────────────────
  'shell-fleet':    'https://www.shell.us/business-customers/shell-fleet-solutions.html',
  'wex-fleet':      'https://www.wexinc.com/products/fleet-cards/',
  'fuelman':        'https://www.fuelman.com/business/fleet-card',

  // ── Business Credit Cards (no PG) ─────────────────────────────────────────
  'brex':           'https://www.brex.com/signup',
  'ramp':           'https://ramp.com/signup',
  'divvy':          'https://getdivvy.com',
  'stripe-biz':     'https://stripe.com/corporate-card',

  // ── Secretary of State / Entity Formation ─────────────────────────────────
  'bizfilings':     'https://www.bizfilings.com',
  'legalzoom':      'https://www.legalzoom.com/business/business-formation/',

  // ── Portal Internal Pages ─────────────────────────────────────────────────
  // Internal routes are handled directly (no redirect needed)
}

// The base URL for tracked links used in AI responses
export const PORTAL_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.sourcifylending.com'

// Helper — returns the tracked URL string to embed in AI responses
export function trackedUrl(slug: string): string {
  return `${PORTAL_BASE}/go/${slug}`
}
