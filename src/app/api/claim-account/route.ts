import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/claim-account?token=xxx — validate token without claiming
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, business_name, invite_status, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (error) {
    console.error('[claim-account] GET error:', error)
    return NextResponse.json({ valid: false, error: 'Server error' }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json({ valid: false })
  }

  if (profile.invite_status === 'accepted') {
    return NextResponse.json({ valid: false, reason: 'already_claimed' })
  }

  if (profile.invite_expires_at && new Date(profile.invite_expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' })
  }

  return NextResponse.json({
    valid: true,
    full_name: profile.full_name,
    email: profile.email,
    business_name: profile.business_name,
  })
}

// POST /api/claim-account — claim account with token and password
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, password } = body as { token?: string; password?: string }

  if (!token) {
    return NextResponse.json({ error: 'Token is required.' }, { status: 400 })
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Validate token
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, invite_status, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (profileError) {
    console.error('[claim-account] POST profile lookup error:', profileError)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json({ error: 'Invalid or expired invite link.' }, { status: 400 })
  }

  if (profile.invite_status === 'accepted') {
    return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 400 })
  }

  if (profile.invite_expires_at && new Date(profile.invite_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite link has expired. Please ask for a new one.' }, { status: 400 })
  }

  // Update auth user password
  const { error: passwordError } = await supabase.auth.admin.updateUserById(profile.id, {
    password,
  })

  if (passwordError) {
    console.error('[claim-account] Password update error:', passwordError)
    return NextResponse.json({ error: 'Failed to set password. Please try again.' }, { status: 500 })
  }

  // Mark invite as accepted
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      invite_status: 'accepted',
      invite_accepted_at: new Date().toISOString(),
      invite_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)

  if (updateError) {
    console.error('[claim-account] Profile update error:', updateError)
    // Non-fatal — password was set, continue
  }

  // Sign the user in
  if (!profile.email) {
    return NextResponse.json({ error: 'Account email not found. Contact support.' }, { status: 500 })
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password,
  })

  if (signInError) {
    console.error('[claim-account] Sign in error:', signInError)
    // Password was set — user can still sign in manually
  }

  return NextResponse.json({ success: true })
}
