import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Fixed UUIDs — idempotent re-seeding (all hex: 0-9, a-f only)
const DEMO_AFFILIATE_ID = '00000000-0000-4000-a000-aff000000001'

// Referral UUIDs
const DEMO_REF_01_ID = '00000000-0000-4000-a000-000000ae0001' // Marcus Johnson   — active, affiliate_closed
const DEMO_REF_02_ID = '00000000-0000-4000-a000-000000ae0002' // Sarah Chen        — active, affiliate_closed
const DEMO_REF_03_ID = '00000000-0000-4000-a000-000000ae0003' // David Rivera      — active, affiliate_closed
const DEMO_REF_04_ID = '00000000-0000-4000-a000-000000ae0004' // Keisha Williams   — active, referral_only
const DEMO_REF_05_ID = '00000000-0000-4000-a000-000000ae0005' // Tony Martinez     — active, affiliate_closed
const DEMO_REF_06_ID = '00000000-0000-4000-a000-000000ae0006' // Brittany Foster   — signed_up
const DEMO_REF_07_ID = '00000000-0000-4000-a000-000000ae0007' // James Okafor      — signed_up
const DEMO_REF_08_ID = '00000000-0000-4000-a000-000000ae0008' // Lisa Nguyen       — past_due (churned, still owes)
const DEMO_REF_09_ID = '00000000-0000-4000-a000-000000ae0009' // Robert Blake      — canceled
const DEMO_REF_10_ID = '00000000-0000-4000-a000-000000ae0010' // Anonymous visitor — clicked

// Commission UUIDs — 18 total for realistic 7-month history
const DEMO_COMM_01_ID = '00000000-0000-4000-a000-000000ac0001'
const DEMO_COMM_02_ID = '00000000-0000-4000-a000-000000ac0002'
const DEMO_COMM_03_ID = '00000000-0000-4000-a000-000000ac0003'
const DEMO_COMM_04_ID = '00000000-0000-4000-a000-000000ac0004'
const DEMO_COMM_05_ID = '00000000-0000-4000-a000-000000ac0005'
const DEMO_COMM_06_ID = '00000000-0000-4000-a000-000000ac0006'
const DEMO_COMM_07_ID = '00000000-0000-4000-a000-000000ac0007'
const DEMO_COMM_08_ID = '00000000-0000-4000-a000-000000ac0008'
const DEMO_COMM_09_ID = '00000000-0000-4000-a000-000000ac0009'
const DEMO_COMM_10_ID = '00000000-0000-4000-a000-000000ac0010'
const DEMO_COMM_11_ID = '00000000-0000-4000-a000-000000ac0011'
const DEMO_COMM_12_ID = '00000000-0000-4000-a000-000000ac0012'
const DEMO_COMM_13_ID = '00000000-0000-4000-a000-000000ac0013'
const DEMO_COMM_14_ID = '00000000-0000-4000-a000-000000ac0014'
const DEMO_COMM_15_ID = '00000000-0000-4000-a000-000000ac0015'
const DEMO_COMM_16_ID = '00000000-0000-4000-a000-000000ac0016' // Robert Blake setup (paid, now canceled)
const DEMO_COMM_17_ID = '00000000-0000-4000-a000-000000ac0017' // Robert Blake recurring (paid before cancel)
const DEMO_COMM_18_ID = '00000000-0000-4000-a000-000000ac0018' // Lisa Nguyen setup (paid, now past_due)

const now    = new Date()
const daysAgo  = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
const daysAgoD = (n: number) => daysAgo(n).split('T')[0]

// ─── Commission amounts stored in CENTS (dashboard divides by 100 to display) ─
//
// Demo uses premium deal sizes to show an aspirational but realistic scenario
// for an affiliate who has been active ~7 months with 7 paying clients:
//
//   Setup gross:  $3,500 (PA) = 350,000 cents  |  $2,000 (PB) = 200,000 cents
//   Recurring:    $800/mo (PA) = 80,000 cents  |  $600/mo (PB) = 60,000 cents
//
// Commission rates (deal-type based):
//   affiliate_closed → 30%   referral_only → 10%
//
//   PA setup 30%: 350000 × 30% = 105,000 cents = $1,050 displayed
//   PA setup 10%: 350000 × 10% =  35,000 cents = $350  displayed
//   PB setup 30%: 200000 × 30% =  60,000 cents = $600  displayed
//   PA recur 30%:  80000 × 30% =  24,000 cents = $240  displayed
//   PB recur 30%:  60000 × 30% =  18,000 cents = $180  displayed
//   PA recur 10%:  80000 × 10% =   8,000 cents = $80   displayed
//
// Target display totals (after ÷100):
//   PAID       10 entries  ≈ $6,020
//   APPROVED    3 entries  ≈ $  500
//   PENDING     5 entries  ≈ $  920
//   ──────────────────────────────
//   TOTAL                  ≈ $7,440

const PA_SETUP_GROSS  = 350000
const PA_SETUP_30     = 105000   // $1,050  affiliate_closed
const PA_SETUP_10     =  35000   // $350    referral_only
const PB_SETUP_GROSS  = 200000
const PB_SETUP_30     =  60000   // $600    affiliate_closed
const PA_RECUR_GROSS  =  80000
const PA_RECUR_30     =  24000   // $240    affiliate_closed
const PA_RECUR_10     =   8000   // $80     referral_only
const PB_RECUR_GROSS  =  60000
const PB_RECUR_30     =  18000   // $180    affiliate_closed

export async function POST() {
  try {
    // 1. Verify admin
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 2. Create or find demo auth user
    const DEMO_EMAIL    = 'affiliate@sourcifylending.com'
    const DEMO_PASSWORD = 'AffiliateDemo123!'

    let demoUserId: string
    const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers.find(u => u.email === DEMO_EMAIL)

    if (existingUser) {
      demoUserId = existingUser.id
    } else {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
      })
      if (createErr || !newUser.user) {
        return NextResponse.json({ error: 'Failed to create auth user', detail: createErr?.message }, { status: 500 })
      }
      demoUserId = newUser.user.id
    }

    // 3. Upsert affiliate record
    const { error: affErr } = await supabase.from('affiliates').upsert({
      id: DEMO_AFFILIATE_ID,
      user_id: demoUserId,
      name: 'Demo Affiliate',
      email: DEMO_EMAIL,
      referral_code: 'DEMOAFF',
      status: 'active',
      is_demo: true,
      has_free_program_b_access: true,
      qualification_start_date: daysAgoD(35),
      free_access_unlocked_at: daysAgo(7),
      notes: 'Demo account for presentations and onboarding walkthroughs',
    }, { onConflict: 'id' })

    if (affErr) {
      return NextResponse.json({ error: 'Failed to upsert affiliate', detail: affErr.message }, { status: 500 })
    }

    // 4. Wipe and re-insert
    await supabase.from('affiliate_commissions').delete().eq('affiliate_id', DEMO_AFFILIATE_ID)
    await supabase.from('affiliate_referrals').delete().eq('affiliate_id', DEMO_AFFILIATE_ID)

    // ── Referrals ────────────────────────────────────────────────────────────
    const referrals = [
      // 5 active
      {
        id: DEMO_REF_01_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'Marcus Johnson', lead_email: 'marcus.j@example.com',
        program_type: 'program_a', referral_status: 'active', subscription_active: true,
        last_payment_at: daysAgo(6), is_self_referral: false, is_flagged: false,
        deal_type: 'affiliate_closed', deal_type_locked: true, deal_type_approved: true,
        deal_type_selected_at: daysAgo(200), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: daysAgo(197),
      },
      {
        id: DEMO_REF_02_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'Sarah Chen', lead_email: 'sarah.c@example.com',
        program_type: 'program_a', referral_status: 'active', subscription_active: true,
        last_payment_at: daysAgo(22), is_self_referral: false, is_flagged: false,
        deal_type: 'affiliate_closed', deal_type_locked: true, deal_type_approved: true,
        deal_type_selected_at: daysAgo(185), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: daysAgo(182),
      },
      {
        id: DEMO_REF_03_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'David Rivera', lead_email: 'david.r@example.com',
        program_type: 'program_b', referral_status: 'active', subscription_active: true,
        last_payment_at: daysAgo(10), is_self_referral: false, is_flagged: false,
        deal_type: 'affiliate_closed', deal_type_locked: true, deal_type_approved: true,
        deal_type_selected_at: daysAgo(165), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: daysAgo(162),
      },
      {
        id: DEMO_REF_04_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'Keisha Williams', lead_email: 'keisha.w@example.com',
        program_type: 'program_a', referral_status: 'active', subscription_active: true,
        last_payment_at: daysAgo(2), is_self_referral: false, is_flagged: false,
        deal_type: 'referral_only', deal_type_locked: true, deal_type_approved: null,
        deal_type_selected_at: daysAgo(130), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: null,
      },
      {
        id: DEMO_REF_05_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'Tony Martinez', lead_email: 'tony.m@example.com',
        program_type: 'program_b', referral_status: 'active', subscription_active: true,
        last_payment_at: daysAgo(18), is_self_referral: false, is_flagged: false,
        deal_type: 'affiliate_closed', deal_type_locked: true, deal_type_approved: true,
        deal_type_selected_at: daysAgo(110), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: daysAgo(107),
      },
      // 2 signed up (not yet paid)
      {
        id: DEMO_REF_06_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'Brittany Foster', lead_email: 'brittany.f@example.com',
        program_type: 'program_b', referral_status: 'signed_up', subscription_active: false,
        last_payment_at: null, is_self_referral: false, is_flagged: false,
        deal_type: 'affiliate_closed', deal_type_locked: false, deal_type_approved: null,
        deal_type_selected_at: daysAgo(4), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: null,
      },
      {
        id: DEMO_REF_07_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'James Okafor', lead_email: 'james.o@example.com',
        program_type: 'program_a', referral_status: 'signed_up', subscription_active: false,
        last_payment_at: null, is_self_referral: false, is_flagged: false,
        deal_type: 'referral_only', deal_type_locked: false, deal_type_approved: null,
        deal_type_selected_at: null, deal_type_selected_by: null, deal_type_approved_at: null,
      },
      // 1 past due (Lisa paid setup, now behind on recurring)
      {
        id: DEMO_REF_08_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'Lisa Nguyen', lead_email: 'lisa.n@example.com',
        program_type: 'program_b', referral_status: 'past_due', subscription_active: false,
        last_payment_at: daysAgo(65), is_self_referral: false, is_flagged: false,
        deal_type: 'affiliate_closed', deal_type_locked: true, deal_type_approved: true,
        deal_type_selected_at: daysAgo(75), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: daysAgo(72),
      },
      // 1 canceled (Robert paid setup + 1 month then canceled)
      {
        id: DEMO_REF_09_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: 'Robert Blake', lead_email: 'robert.b@example.com',
        program_type: 'program_a', referral_status: 'canceled', subscription_active: false,
        last_payment_at: daysAgo(45), is_self_referral: false, is_flagged: false,
        deal_type: 'affiliate_closed', deal_type_locked: true, deal_type_approved: true,
        deal_type_selected_at: daysAgo(80), deal_type_selected_by: 'affiliate',
        deal_type_approved_at: daysAgo(77),
      },
      // 1 clicked
      {
        id: DEMO_REF_10_ID, affiliate_id: DEMO_AFFILIATE_ID,
        lead_name: null, lead_email: 'prospect.123@demo.com',
        program_type: null, referral_status: 'clicked', subscription_active: false,
        last_payment_at: null, is_self_referral: false, is_flagged: false,
        deal_type: 'referral_only', deal_type_locked: false, deal_type_approved: null,
        deal_type_selected_at: null, deal_type_selected_by: null, deal_type_approved_at: null,
      },
    ]

    const { error: refErr } = await supabase.from('affiliate_referrals').insert(referrals)
    if (refErr) {
      return NextResponse.json({ error: 'Failed to insert referrals', detail: refErr.message }, { status: 500 })
    }

    // ── Commissions ──────────────────────────────────────────────────────────
    // All amounts in CENTS. Dashboard divides by 100 to display.
    // 18 commissions representing ~7 months of history across 7 paying clients.
    // Total: ~744,000 cents → displayed as ~$7,440

    const mkComm = (
      id: string,
      refId: string,
      programType: string,
      commType: 'setup' | 'recurring',
      dealType: 'referral_only' | 'affiliate_closed',
      grossCents: number,
      pct: number,
      commCents: number,
      status: 'paid' | 'approved' | 'pending',
      createdDaysAgo: number,
      key: string,
    ) => {
      const createdAt   = daysAgo(createdDaysAgo)
      const availableAt = daysAgo(Math.max(0, createdDaysAgo - 7))
      const approvedAt  = (status === 'approved' || status === 'paid') ? daysAgo(Math.max(1, createdDaysAgo - 10)) : null
      const paidAt      = status === 'paid' ? daysAgo(Math.max(1, createdDaysAgo - 14)) : null
      return {
        id, affiliate_id: DEMO_AFFILIATE_ID, referral_id: refId,
        user_id: null, program_type: programType, commission_type: commType,
        deal_type: dealType, gross_amount: grossCents,
        commission_percent: pct, commission_amount: commCents,
        status, available_at: availableAt, approved_at: approvedAt, paid_at: paidAt,
        reversed_at: null, reversal_reason: null, idempotency_key: key, created_at: createdAt,
      }
    }

    const commissions = [
      // ── PAID (10) — 40–200 days ago ─────────────────────────────────────────
      // Marcus   REF_01  PA  affiliate_closed (30%)  — setup + month 1
      mkComm(DEMO_COMM_01_ID, DEMO_REF_01_ID, 'program_a', 'setup',     'affiliate_closed', PA_SETUP_GROSS, 30, PA_SETUP_30, 'paid', 200, 'demo_c01'),
      mkComm(DEMO_COMM_02_ID, DEMO_REF_01_ID, 'program_a', 'recurring', 'affiliate_closed', PA_RECUR_GROSS, 30, PA_RECUR_30, 'paid', 165, 'demo_c02'),
      // Sarah    REF_02  PA  affiliate_closed (30%)  — setup + month 1
      mkComm(DEMO_COMM_03_ID, DEMO_REF_02_ID, 'program_a', 'setup',     'affiliate_closed', PA_SETUP_GROSS, 30, PA_SETUP_30, 'paid', 185, 'demo_c03'),
      mkComm(DEMO_COMM_04_ID, DEMO_REF_02_ID, 'program_a', 'recurring', 'affiliate_closed', PA_RECUR_GROSS, 30, PA_RECUR_30, 'paid', 150, 'demo_c04'),
      // David    REF_03  PB  affiliate_closed (30%)  — setup + month 1
      mkComm(DEMO_COMM_05_ID, DEMO_REF_03_ID, 'program_b', 'setup',     'affiliate_closed', PB_SETUP_GROSS, 30, PB_SETUP_30, 'paid', 165, 'demo_c05'),
      mkComm(DEMO_COMM_06_ID, DEMO_REF_03_ID, 'program_b', 'recurring', 'affiliate_closed', PB_RECUR_GROSS, 30, PB_RECUR_30, 'paid', 130, 'demo_c06'),
      // Keisha   REF_04  PA  referral_only    (10%)  — setup
      mkComm(DEMO_COMM_07_ID, DEMO_REF_04_ID, 'program_a', 'setup',     'referral_only',    PA_SETUP_GROSS, 10, PA_SETUP_10, 'paid', 130, 'demo_c07'),
      // Tony     REF_05  PB  affiliate_closed (30%)  — setup
      mkComm(DEMO_COMM_08_ID, DEMO_REF_05_ID, 'program_b', 'setup',     'affiliate_closed', PB_SETUP_GROSS, 30, PB_SETUP_30, 'paid', 110, 'demo_c08'),
      // Robert   REF_09  PA  affiliate_closed (30%)  — setup + month 1 (now canceled)
      mkComm(DEMO_COMM_16_ID, DEMO_REF_09_ID, 'program_a', 'setup',     'affiliate_closed', PA_SETUP_GROSS, 30, PA_SETUP_30, 'paid',  80, 'demo_c16'),
      mkComm(DEMO_COMM_17_ID, DEMO_REF_09_ID, 'program_a', 'recurring', 'affiliate_closed', PA_RECUR_GROSS, 30, PA_RECUR_30, 'paid',  48, 'demo_c17'),
      // Lisa     REF_08  PB  affiliate_closed (30%)  — setup only (now past_due on recurring)
      mkComm(DEMO_COMM_18_ID, DEMO_REF_08_ID, 'program_b', 'setup',     'affiliate_closed', PB_SETUP_GROSS, 30, PB_SETUP_30, 'paid',  65, 'demo_c18'),

      // ── APPROVED (3) — 35–55 days ago ───────────────────────────────────────
      // David    REF_03  PB  recurring month 2
      mkComm(DEMO_COMM_09_ID,  DEMO_REF_03_ID, 'program_b', 'recurring', 'affiliate_closed', PB_RECUR_GROSS, 30, PB_RECUR_30, 'approved', 55, 'demo_c09'),
      // Keisha   REF_04  PA  recurring month 1
      mkComm(DEMO_COMM_10_ID,  DEMO_REF_04_ID, 'program_a', 'recurring', 'referral_only',    PA_RECUR_GROSS, 10, PA_RECUR_10, 'approved', 44, 'demo_c10'),
      // Marcus   REF_01  PA  recurring month 2
      mkComm(DEMO_COMM_11_ID,  DEMO_REF_01_ID, 'program_a', 'recurring', 'affiliate_closed', PA_RECUR_GROSS, 30, PA_RECUR_30, 'approved', 35, 'demo_c11'),

      // ── PENDING (5) — last 22 days ───────────────────────────────────────────
      // Sarah    REF_02  PA  recurring month 2
      mkComm(DEMO_COMM_12_ID, DEMO_REF_02_ID, 'program_a', 'recurring', 'affiliate_closed', PA_RECUR_GROSS, 30, PA_RECUR_30, 'pending', 22, 'demo_c12'),
      // Tony     REF_05  PB  recurring month 1
      mkComm(DEMO_COMM_13_ID, DEMO_REF_05_ID, 'program_b', 'recurring', 'affiliate_closed', PB_RECUR_GROSS, 30, PB_RECUR_30, 'pending', 18, 'demo_c13'),
      // David    REF_03  PB  recurring month 3
      mkComm(DEMO_COMM_14_ID, DEMO_REF_03_ID, 'program_b', 'recurring', 'affiliate_closed', PB_RECUR_GROSS, 30, PB_RECUR_30, 'pending', 10, 'demo_c14'),
      // Marcus   REF_01  PA  recurring month 3
      mkComm(DEMO_COMM_15_ID, DEMO_REF_01_ID, 'program_a', 'recurring', 'affiliate_closed', PA_RECUR_GROSS, 30, PA_RECUR_30, 'pending',  6, 'demo_c15'),
      // Keisha   REF_04  PA  recurring month 2
      // (reusing ac0015 slot—there's a gap above; using last open slot)
    ]

    const { error: commErr } = await supabase.from('affiliate_commissions').insert(commissions)
    if (commErr) {
      return NextResponse.json({ error: 'Failed to insert commissions', detail: commErr.message }, { status: 500 })
    }

    // Display verification (amounts after ÷100):
    // PAID (11):   105000×3 + 24000×3 + 60000×3 + 35000 + 18000 = 315000+72000+180000+35000+18000 = 620,000 → $6,200
    // APPROVED (3): 18000+8000+24000 = 50,000 → $500
    // PENDING (4):  24000+18000+18000+24000 = 84,000 → $840
    // TOTAL: 754,000 cents → $7,540

    return NextResponse.json({
      success: true,
      message: 'Demo affiliate seeded',
      affiliate: { email: DEMO_EMAIL, referral_code: 'DEMOAFF' },
      display_totals: {
        paid:     '~$6,200',
        approved: '~$500',
        pending:  '~$840',
        total:    '~$7,540',
      },
    })
  } catch (e) {
    console.error('[seed-demo-affiliate]', e)
    return NextResponse.json({ error: 'Unexpected error', detail: String(e) }, { status: 500 })
  }
}
