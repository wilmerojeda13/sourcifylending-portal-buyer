import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ synced: false, reason: 'unauthorized' }, { status: 401 })
    }

    const cookieStore = await cookies()
    const refCode = cookieStore.get('affiliate_ref')?.value ?? null
    const leadId = cookieStore.get('affiliate_lead')?.value ?? null
    if (!refCode) {
      return NextResponse.json({ synced: false, reason: 'missing_ref' })
    }

    const supabase = await createServiceClient()
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, user_id, name, email, created_at')
      .eq('referral_code', refCode.toUpperCase())
      .eq('status', 'active')
      .maybeSingle()

    if (!affiliate) {
      return NextResponse.json({ synced: false, reason: 'affiliate_not_found' })
    }

    const now = new Date().toISOString()
    let leadRecordId: string | null = null
    let leadDealType = 'partner_assisted'

    if (leadId) {
      const { data: leadRecord } = await supabase
        .from('affiliate_leads')
        .select('id, deal_type, email')
        .eq('id', leadId)
        .eq('affiliate_id', affiliate.id)
        .maybeSingle()

      if (leadRecord) {
        leadRecordId = leadRecord.id
        leadDealType = leadRecord.deal_type || 'partner_assisted'
      }
    }

    const { data: existingReferral } = await supabase
      .from('affiliate_referrals')
      .select('id')
      .eq('affiliate_id', affiliate.id)
      .eq('lead_email', user.email)
      .maybeSingle()

    let referralId: string | null = existingReferral?.id ?? null
    if (!existingReferral) {
      const { data: newReferral, error: referralError } = await supabase
        .from('affiliate_referrals')
        .insert({
          affiliate_id: affiliate.id,
          user_id: user.id,
          lead_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0] || '',
          lead_email: user.email,
          referral_status: 'signed_up',
          deal_type: leadDealType,
          acquisition_path: 'partner_assisted',
          partner_relationship_started_at: now,
          onboarding_status: 'partner_closing',
        })
        .select('id')
        .single()

      if (referralError) throw referralError
      referralId = newReferral?.id ?? null
    }

    if (leadRecordId) {
      const { error: updateError } = await supabase.from('affiliate_leads').update({
        user_id: user.id,
        referral_id: referralId,
        status: 'account_created',
        account_created_at: now,
        converted_at: now,
        acquisition_path: 'partner_assisted',
        onboarding_status: 'partner_closing',
        partner_relationship_started_at: now,
        updated_at: now,
      }).eq('id', leadRecordId)

      if (updateError) throw updateError
    }

    return NextResponse.json({
      synced: true,
      affiliate_id: affiliate.id,
      lead_id: leadRecordId,
      referral_id: referralId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    console.error('[auth/sync-partner-attribution]', error)
    return NextResponse.json({ synced: false, error: message }, { status: 500 })
  }
}
