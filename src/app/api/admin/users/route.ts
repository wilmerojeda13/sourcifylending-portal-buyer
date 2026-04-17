import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ensureSignupCrmLead } from '@/lib/signup-crm'

async function verifyAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const supabase = await createServiceClient()
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return data?.is_admin ? supabase : null
}

// POST — create a new user manually
export async function POST(req: NextRequest) {
  const supabase = await verifyAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { full_name, email, plan_tier, assigned_program, subscription_status } = await req.json()

  if (!full_name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  // Generate a secure temporary password
  const tempPassword = `Sourcify${Math.random().toString(36).slice(2, 10)}!`

  // Create the auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const userId = authUser.user.id

  // Upsert profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name,
    email,
    plan_tier: plan_tier || 'free',
    assigned_program: assigned_program || null,
    subscription_status: subscription_status || 'inactive',
    created_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  if (profileError) {
    // Auth user was created but profile failed — clean up
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create profile: ' + profileError.message }, { status: 500 })
  }

  try {
    const crmLead = await ensureSignupCrmLead({
      supabase,
      userId,
      fullName: full_name,
      email,
      businessName: null,
      source: 'admin_manual',
      suspicious: false,
    })

    await supabase
      .from('profiles')
      .update({
        lead_id: crmLead.leadId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
  } catch (crmError) {
    console.error('[admin/users] CRM lead sync failed', crmError)
  }

  return NextResponse.json({ user_id: userId, temp_password: tempPassword })
}

// DELETE — permanently delete a user and all their data
export async function DELETE(req: NextRequest) {
  const supabase = await verifyAdmin()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('id')
  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  // Delete auth user — cascades to profiles via FK
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
