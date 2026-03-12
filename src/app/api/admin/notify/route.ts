import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'
import type { NotificationType } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createServiceClient()
    const { data: adminCheck } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!adminCheck?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { user_id, title, message, type = 'system' } = await req.json() as {
      user_id: string
      title: string
      message: string
      type?: NotificationType
    }

    if (!user_id || !title || !message) {
      return NextResponse.json({ error: 'user_id, title, and message are required' }, { status: 400 })
    }

    const { error } = await supabase.from('notifications').insert({
      user_id,
      type,
      title,
      message,
      read: false,
      created_at: new Date().toISOString(),
    })

    if (error) throw error

    await logActivity(user_id, 'notification_sent', {
      admin_action: true,
      admin_email: user.email,
      title,
      type,
    }, req)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin notify error:', error)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
