import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { AnalyzerResult } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      email,
      password,
      full_name,
      business_name,
      lead_id,
      analyzer_result,
    }: {
      email: string
      password: string
      full_name: string
      business_name?: string
      lead_id?: string | null
      analyzer_result?: AnalyzerResult | null
    } = body

    if (!email || !password || !full_name) {
      return NextResponse.json(
        { error: 'email, password, and full_name are required' },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      )
    }

    const supabase = await createServiceClient()

    // Create auth user — auto-confirm so prospect can log in immediately
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        business_name: business_name ?? null,
      },
    })

    if (authError) {
      const msg = authError.message ?? ''
      if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already been registered') ||
        msg.toLowerCase().includes('user already exists')
      ) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const userId = authData.user.id
    const now = new Date().toISOString()

    // Upsert profile — prospect state, copy analyzer snapshot
    await supabase.from('profiles').upsert({
      id: userId,
      full_name,
      email: email.toLowerCase().trim(),
      business_name: business_name ?? null,
      account_state: 'prospect',
      subscription_status: 'inactive',
      progress_percentage: 0,
      nsf_flag: false,
      lead_id: lead_id ?? null,
      assigned_program: analyzer_result?.assigned_program ?? null,
      readiness_status: analyzer_result?.readiness_status ?? null,
      latest_analyzer_result: analyzer_result ?? null,
      analyzed_at: now,
      updated_at: now,
    })

    // Link lead → user (mark as converted)
    if (lead_id) {
      await supabase
        .from('leads')
        .update({ converted_to_user_id: userId })
        .eq('id', lead_id)
    }

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      event_type: 'signup',
      event_data: {
        email,
        source: 'free_analyzer_prospect',
        account_state: 'prospect',
        program_recommended: analyzer_result?.assigned_program ?? null,
      },
      created_at: now,
    })

    return NextResponse.json({ success: true, user_id: userId })
  } catch (error) {
    console.error('create-prospect error:', error)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
