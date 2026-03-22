import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Fixed UUIDs — idempotent re-seeding
const DEMO_AFFILIATE_ID = '00000000-0000-4000-a000-aff000000001'

const DEMO_REF_01_ID = '00000000-0000-4000-a000-ref000000001'
const DEMO_REF_02_ID = '00000000-0000-4000-a000-ref000000002'
const DEMO_REF_03_ID = '00000000-0000-4000-a000-ref000000003'
const DEMO_REF_04_ID = '00000000-0000-4000-a000-ref000000004'
const DEMO_REF_05_ID = '00000000-0000-4000-a000-ref000000005'
const DEMO_REF_06_ID = '00000000-0000-4000-a000-ref000000006'
const DEMO_REF_07_ID = '00000000-0000-4000-a000-ref000000007'
const DEMO_REF_08_ID = '00000000-0000-4000-a000-ref000000008'
const DEMO_REF_09_ID = '00000000-0000-4000-a000-ref000000009'
const DEMO_REF_10_ID = '00000000-0000-4000-a000-ref000000010'

const DEMO_COMM_01_ID = '00000000-0000-4000-a000-com000000001'
const DEMO_COMM_02_ID = '00000000-0000-4000-a000-com000000002'
const DEMO_COMM_03_ID = '00000000-0000-4000-a000-com000000003'
const DEMO_COMM_04_ID = '00000000-0000-4000-a000-com000000004'
const DEMO_COMM_05_ID = '00000000-0000-4000-a000-com000000005'
const DEMO_COMM_06_ID = '00000000-0000-4000-a000-com000000006'
const DEMO_COMM_07_ID = '00000000-0000-4000-a000-com000000007'
const DEMO_COMM_08_ID = '00000000-0000-4000-a000-com000000008'
const DEMO_COMM_09_ID = '00000000-0000-4000-a000-com000000009'
const DEMO_COMM_10_ID = '00000000-0000-4000-a000-com000000010'
const DEMO_COMM_11_ID = '00000000-0000-4000-a000-com000000011'
const DEMO_COMM_12_ID = '00000000-0000-4000-a000-com000000012'
const DEMO_COMM_13_ID = '00000000-0000-4000-a000-com000000013'
const DEMO_COMM_14_ID = '00000000-0000-4000-a000-com000000014'
const DEMO_COMM_15_ID = '00000000-0000-4000-a000-com000000015'

const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000).toISOString()
const daysAgoDate = (n: number) => new Date(now.getTime() - n * 86400_000).toISOString().split('T')[0]

// Commission math
const PB_SETUP_GROSS = 99700    // $997
const PB_SETUP_COMM = 29910     // 30%
const PB_RECUR_GROSS = 19900    // $199
const PB_RECUR_COMM = 3980      // 20%
const PA_SETUP_GROSS = 150000   // $1500
const PA_SETUP_COMM = 45000     // 30%
const PA_RECUR_GROSS = 39900    // $399
const PA_RECUR_COMM = 7980      // 20%

export async function POST() {
  try {
    // 1. Verify admin auth
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServiceClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 2. Create or find the demo affiliate auth user
    const DEMO_EMAIL = 'affiliate@sourcifylending.com'
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

    // 3. Upsert the affiliate record
    const { error: affErr } = await supabase
      .from('affiliates')
      .upsert({
        id: DEMO_AFFILIATE_ID,
        user_id: demoUserId,
        name: 'Demo Affiliate',
        email: DEMO_EMAIL,
        referral_code: 'DEMOAFF',
        status: 'active',
        is_demo: true,
        has_free_program_b_access: true,
        qualification_start_date: daysAgoDate(35),
        free_access_unlocked_at: daysAgo(7),
        notes: 'Demo account for presentations and onboarding walkthroughs',
      }, { onConflict: 'id' })

    if (affErr) {
      return NextResponse.json({ error: 'Failed to upsert affiliate', detail: affErr.message }, { status: 500 })
    }

    // 4. Delete and re-insert referrals
    await supabase.from('affiliate_commissions').delete().eq('affiliate_id', DEMO_AFFILIATE_ID)
    await supabase.from('affiliate_referrals').delete().eq('affiliate_id', DEMO_AFFILIATE_ID)

    const referrals = [
      // 5 active
      {
        id: DEMO_REF_01_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'Marcus Johnson',
        lead_email: 'marcus.j@example.com',
        program_type: 'program_b',
        referral_status: 'active',
        subscription_active: true,
        last_payment_at: daysAgo(5),
        is_self_referral: false,
        is_flagged: false,
      },
      {
        id: DEMO_REF_02_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'Sarah Chen',
        lead_email: 'sarah.c@example.com',
        program_type: 'program_b',
        referral_status: 'active',
        subscription_active: true,
        last_payment_at: daysAgo(12),
        is_self_referral: false,
        is_flagged: false,
      },
      {
        id: DEMO_REF_03_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'David Rivera',
        lead_email: 'david.r@example.com',
        program_type: 'program_a',
        referral_status: 'active',
        subscription_active: true,
        last_payment_at: daysAgo(8),
        is_self_referral: false,
        is_flagged: false,
      },
      {
        id: DEMO_REF_04_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'Keisha Williams',
        lead_email: 'keisha.w@example.com',
        program_type: 'program_b',
        referral_status: 'active',
        subscription_active: true,
        last_payment_at: daysAgo(3),
        is_self_referral: false,
        is_flagged: false,
      },
      {
        id: DEMO_REF_05_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'Tony Martinez',
        lead_email: 'tony.m@example.com',
        program_type: 'program_b',
        referral_status: 'active',
        subscription_active: true,
        last_payment_at: daysAgo(18),
        is_self_referral: false,
        is_flagged: false,
      },
      // 2 signed up
      {
        id: DEMO_REF_06_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'Brittany Foster',
        lead_email: 'brittany.f@example.com',
        program_type: 'program_b',
        referral_status: 'signed_up',
        subscription_active: false,
        last_payment_at: null,
        is_self_referral: false,
        is_flagged: false,
      },
      {
        id: DEMO_REF_07_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'James Okafor',
        lead_email: 'james.o@example.com',
        program_type: 'program_a',
        referral_status: 'signed_up',
        subscription_active: false,
        last_payment_at: null,
        is_self_referral: false,
        is_flagged: false,
      },
      // 1 past due
      {
        id: DEMO_REF_08_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'Lisa Nguyen',
        lead_email: 'lisa.n@example.com',
        program_type: 'program_b',
        referral_status: 'past_due',
        subscription_active: false,
        last_payment_at: null,
        is_self_referral: false,
        is_flagged: false,
      },
      // 1 canceled
      {
        id: DEMO_REF_09_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: 'Robert Blake',
        lead_email: 'robert.b@example.com',
        program_type: 'program_a',
        referral_status: 'canceled',
        subscription_active: false,
        last_payment_at: null,
        is_self_referral: false,
        is_flagged: false,
      },
      // 1 clicked
      {
        id: DEMO_REF_10_ID,
        affiliate_id: DEMO_AFFILIATE_ID,
        user_id: null,
        lead_name: null,
        lead_email: 'prospect.123@demo.com',
        program_type: null,
        referral_status: 'clicked',
        subscription_active: false,
        last_payment_at: null,
        is_self_referral: false,
        is_flagged: false,
      },
    ]

    const { error: refErr } = await supabase.from('affiliate_referrals').insert(referrals)
    if (refErr) {
      return NextResponse.json({ error: 'Failed to insert referrals', detail: refErr.message }, { status: 500 })
    }

    // 5. Insert commissions (15 total, mix of paid/approved/pending)
    // Paid commissions — older, 3–5 months ago
    // Approved — 1–2 months ago, available but not paid
    // Pending — last 30 days

    const mkComm = (
      id: string,
      refId: string,
      programType: string,
      commType: 'setup' | 'recurring',
      grossAmount: number,
      commPercent: number,
      commAmount: number,
      status: 'paid' | 'approved' | 'pending',
      createdDaysAgo: number,
      key: string,
    ) => {
      const createdAt = daysAgo(createdDaysAgo)
      const availableAt = daysAgo(createdDaysAgo - 7) // available 7 days after created
      const approvedAt = (status === 'approved' || status === 'paid') ? daysAgo(Math.max(1, createdDaysAgo - 10)) : null
      const paidAt = status === 'paid' ? daysAgo(Math.max(1, createdDaysAgo - 14)) : null

      return {
        id,
        affiliate_id: DEMO_AFFILIATE_ID,
        referral_id: refId,
        user_id: null,
        program_type: programType,
        commission_type: commType,
        gross_amount: grossAmount,
        commission_percent: commPercent,
        commission_amount: commAmount,
        status,
        available_at: availableAt,
        approved_at: approvedAt,
        paid_at: paidAt,
        reversed_at: null,
        reversal_reason: null,
        idempotency_key: key,
        created_at: createdAt,
      }
    }

    const commissions = [
      // ── PAID (older, 3–5 months ago) ──────────────────────────────────────
      // Marcus Johnson (REF_01) — program_b setup paid 120 days ago
      mkComm(DEMO_COMM_01_ID, DEMO_REF_01_ID, 'program_b', 'setup', PB_SETUP_GROSS, 30, PB_SETUP_COMM, 'paid', 120, 'demo_comm_01'),
      // Marcus Johnson — program_b recurring paid 90 days ago
      mkComm(DEMO_COMM_02_ID, DEMO_REF_01_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'paid', 90, 'demo_comm_02'),
      // Sarah Chen (REF_02) — program_b setup paid 110 days ago
      mkComm(DEMO_COMM_03_ID, DEMO_REF_02_ID, 'program_b', 'setup', PB_SETUP_GROSS, 30, PB_SETUP_COMM, 'paid', 110, 'demo_comm_03'),
      // Sarah Chen — program_b recurring paid 80 days ago
      mkComm(DEMO_COMM_04_ID, DEMO_REF_02_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'paid', 80, 'demo_comm_04'),
      // David Rivera (REF_03) — program_a setup paid 100 days ago
      mkComm(DEMO_COMM_05_ID, DEMO_REF_03_ID, 'program_a', 'setup', PA_SETUP_GROSS, 30, PA_SETUP_COMM, 'paid', 100, 'demo_comm_05'),
      // Keisha Williams (REF_04) — program_b setup paid 95 days ago
      mkComm(DEMO_COMM_06_ID, DEMO_REF_04_ID, 'program_b', 'setup', PB_SETUP_GROSS, 30, PB_SETUP_COMM, 'paid', 95, 'demo_comm_06'),
      // Tony Martinez (REF_05) — program_b setup paid 85 days ago
      mkComm(DEMO_COMM_07_ID, DEMO_REF_05_ID, 'program_b', 'setup', PB_SETUP_GROSS, 30, PB_SETUP_COMM, 'paid', 85, 'demo_comm_07'),

      // ── APPROVED (1–2 months ago, available but not yet paid) ────────────
      // Marcus Johnson — program_b recurring approved 45 days ago
      mkComm(DEMO_COMM_08_ID, DEMO_REF_01_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'approved', 45, 'demo_comm_08'),
      // David Rivera — program_a recurring approved 40 days ago
      mkComm(DEMO_COMM_09_ID, DEMO_REF_03_ID, 'program_a', 'recurring', PA_RECUR_GROSS, 20, PA_RECUR_COMM, 'approved', 40, 'demo_comm_09'),
      // Keisha Williams — program_b recurring approved 35 days ago
      mkComm(DEMO_COMM_10_ID, DEMO_REF_04_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'approved', 35, 'demo_comm_10'),

      // ── PENDING (last 30 days) ────────────────────────────────────────────
      // Sarah Chen — program_b recurring pending 20 days ago
      mkComm(DEMO_COMM_11_ID, DEMO_REF_02_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'pending', 20, 'demo_comm_11'),
      // Tony Martinez — program_b recurring pending 18 days ago
      mkComm(DEMO_COMM_12_ID, DEMO_REF_05_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'pending', 18, 'demo_comm_12'),
      // David Rivera — program_a recurring pending 8 days ago
      mkComm(DEMO_COMM_13_ID, DEMO_REF_03_ID, 'program_a', 'recurring', PA_RECUR_GROSS, 20, PA_RECUR_COMM, 'pending', 8, 'demo_comm_13'),
      // Marcus Johnson — program_b recurring pending 5 days ago
      mkComm(DEMO_COMM_14_ID, DEMO_REF_01_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'pending', 5, 'demo_comm_14'),
      // Keisha Williams — program_b recurring pending 3 days ago
      mkComm(DEMO_COMM_15_ID, DEMO_REF_04_ID, 'program_b', 'recurring', PB_RECUR_GROSS, 20, PB_RECUR_COMM, 'pending', 3, 'demo_comm_15'),
    ]

    const { error: commErr } = await supabase.from('affiliate_commissions').insert(commissions)
    if (commErr) {
      return NextResponse.json({ error: 'Failed to insert commissions', detail: commErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Demo affiliate seeded',
      affiliate: {
        email: DEMO_EMAIL,
        referral_code: 'DEMOAFF',
      },
    })
  } catch (e) {
    console.error('[seed-demo-affiliate]', e)
    return NextResponse.json({ error: 'Unexpected error', detail: String(e) }, { status: 500 })
  }
}
