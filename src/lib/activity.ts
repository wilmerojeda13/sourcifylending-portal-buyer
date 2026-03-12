import { createServiceClient } from '@/lib/supabase/server'
import type { ActivityEventType } from '@/types'
import type { NextRequest } from 'next/server'

export async function logActivity(
  userId: string,
  eventType: ActivityEventType,
  eventData?: Record<string, unknown>,
  req?: NextRequest,
) {
  try {
    const supabase = await createServiceClient()
    const ip = req
      ? (req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
         req.headers.get('x-real-ip') ??
         null)
      : null
    const userAgent = req ? req.headers.get('user-agent') : null

    await supabase.from('activity_logs').insert({
      user_id: userId,
      event_type: eventType,
      event_data: eventData ?? null,
      ip_address: ip,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Never throw — logging should be fire-and-forget
  }
}
