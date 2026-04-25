import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface ChatbotEvent {
  event:
    | 'chatbot_opened'
    | 'first_message_sent'
    | 'lead_submitted'
    | 'qualification_completed'
    | 'cta_clicked'
  status?: string
  score?: number
  cta_type?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatbotEvent = await request.json()

    if (!body.event) {
      return NextResponse.json(
        { error: 'Missing event field' },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()
    const timestamp = new Date().toISOString()
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip')?.trim() ||
      'unknown'

    // Try to log to chatbot_events table if it exists
    // Otherwise, just log to console (graceful degradation)
    try {
      const { error: insertError } = await supabase
        .from('chatbot_events')
        .insert({
          event_type: body.event,
          status: body.status || null,
          score: body.score || null,
          cta_type: body.cta_type || null,
          ip_address: clientIp,
          user_agent: request.headers.get('user-agent') || null,
          created_at: timestamp,
        })

      if (insertError) {
        console.warn('[Chatbot Analytics] Insert error (table may not exist):', {
          error: insertError.message,
          event: body.event,
        })
      } else {
        console.info(`[Chatbot Analytics] Event logged: ${body.event}`, {
          status: body.status,
          score: body.score,
          cta_type: body.cta_type,
        })
      }
    } catch (error) {
      console.warn('[Chatbot Analytics] Failed to log event:', {
        error,
        event: body.event,
      })
    }

    // Always return 200 - analytics failures don't block the user experience
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[Chatbot Analytics] API error:', error)
    // Fail silently for analytics
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
