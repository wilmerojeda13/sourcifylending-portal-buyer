import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { QualificationResult } from '@/types'

interface LeadRequest {
  full_name: string
  email: string
  phone?: string
  business_name: string
  business_age?: string
  monthly_revenue?: string
  credit_score_range?: string
  funding_goal?: string
  industry?: string
  state?: string
  has_business_credit?: boolean
  has_bank_statements?: boolean
  qualificationResult?: QualificationResult
}

interface ChatbotMetadata {
  business_age?: string
  monthly_revenue?: string
  credit_score_range?: string
  funding_goal?: string
  industry?: string
  state?: string
  has_business_credit?: boolean
  has_bank_statements?: boolean
  lead_quality?: 'high' | 'medium' | 'low'
  is_verified?: boolean
  source_confidence?: number
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

async function checkRateLimitDatabase(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  email: string,
  ip: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check for duplicate submissions in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentLeads, error: selectError } = await supabase
      .from('leads')
      .select('id, created_at')
      .eq('email', email)
      .eq('source', 'chatbot')
      .gte('created_at', fiveMinutesAgo)
      .limit(1)

    if (selectError) {
      console.warn('Rate limit check failed:', selectError)
      // Allow on error, log for monitoring
      return { allowed: true }
    }

    if (recentLeads && recentLeads.length > 0) {
      return { allowed: false, reason: 'Duplicate submission within 5 minutes' }
    }

    return { allowed: true }
  } catch (error) {
    console.error('Rate limit database check error:', error)
    // Fail open - allow submission on error
    return { allowed: true }
  }
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request)

  try {
    const body: LeadRequest = await request.json()
    const normalizedEmail = body.email?.toLowerCase().trim()

    // Validate required fields
    if (!body.full_name || !normalizedEmail || !body.business_name) {
      return NextResponse.json(
        { error: 'Missing required fields: full_name, email, business_name' },
        { status: 400 }
      )
    }

    // Email validation (same as public_form pattern)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    // Phone validation (if provided)
    let normalizedPhone: string | null = null
    if (body.phone) {
      const digitsOnly = body.phone.replace(/\D/g, '')
      if (!/^\d{10,}$/.test(digitsOnly)) {
        return NextResponse.json(
          { error: 'Invalid phone number' },
          { status: 400 }
        )
      }
      normalizedPhone = digitsOnly
    }

    const supabase = await createServiceClient()

    // Database-backed rate limiting (5-minute duplicate window)
    const rateLimitCheck = await checkRateLimitDatabase(supabase, normalizedEmail, clientIp)
    if (!rateLimitCheck.allowed) {
      console.warn(`[Chatbot] Rate limit hit: ${normalizedEmail} from ${clientIp}`)
      return NextResponse.json(
        { error: `Too many submissions. Please wait and try again. (${rateLimitCheck.reason})` },
        { status: 429 }
      )
    }

    // Check for recent duplicate by email + source
    const { data: existingLead, error: selectError } = await supabase
      .from('leads')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('source', 'chatbot')
      .maybeSingle()

    if (selectError) {
      console.error('[Chatbot] Duplicate check error:', selectError)
      // Log but allow - don't block on DB query failure
    }

    if (existingLead) {
      console.info(`[Chatbot] Lead already exists: ${normalizedEmail}`)
      return NextResponse.json(
        { id: existingLead.id, message: 'Lead already exists' },
        { status: 200 }
      )
    }

    // Calculate lead quality score
    const collectedFieldCount = [
      body.business_age,
      body.monthly_revenue,
      body.credit_score_range,
      body.funding_goal,
      body.industry,
      body.state,
    ].filter(Boolean).length
    const completenessRatio = collectedFieldCount / 6
    const leadQuality: 'high' | 'medium' | 'low' =
      completenessRatio >= 0.8 ? 'high' : completenessRatio >= 0.5 ? 'medium' : 'low'

    // Build metadata object following the pattern from analyzer_answers
    const chatbotMetadata: ChatbotMetadata = {
      business_age: body.business_age || undefined,
      monthly_revenue: body.monthly_revenue || undefined,
      credit_score_range: body.credit_score_range || undefined,
      funding_goal: body.funding_goal || undefined,
      industry: body.industry || undefined,
      state: body.state || undefined,
      has_business_credit: body.has_business_credit || false,
      has_bank_statements: body.has_bank_statements || false,
      lead_quality: leadQuality,
      is_verified: false, // Always false initially - sales team marks as verified
      source_confidence: Math.round(completenessRatio * 100),
    }

    // Insert lead using the same pattern as the analyzer
    // Store chatbot data in a JSONB field similar to analyzer_answers
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        full_name: body.full_name.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        business_name: body.business_name.trim(),
        source: 'chatbot',
        // Store answers in analyzer_answers format (JSONB)
        // This allows consistent querying across both sources
        analyzer_answers: chatbotMetadata,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[Chatbot] Lead insert error:', {
        error: insertError.message,
        code: insertError.code,
        email: normalizedEmail,
        details: insertError.details,
      })
      return NextResponse.json(
        {
          error: 'Failed to save lead. Please try again.',
          details: process.env.NODE_ENV === 'development' ? insertError.message : undefined,
        },
        { status: 500 }
      )
    }

    if (!newLead || !newLead.id) {
      console.error('[Chatbot] Lead insert succeeded but no ID returned', { email: normalizedEmail })
      return NextResponse.json(
        { error: 'Lead saved but could not retrieve ID' },
        { status: 500 }
      )
    }

    console.info(`[Chatbot] Lead created: ${newLead.id} from ${normalizedEmail}`, {
      quality: leadQuality,
      confidence: chatbotMetadata.source_confidence,
    })

    // Sync to CRM if qualification result is provided
    if (body.qualificationResult) {
      try {
        const { syncChatbotLeadLifecycle } = await import('@/lib/chatbot-crm')
        const crmResult = await syncChatbotLeadLifecycle({
          supabase,
          fullName: body.full_name,
          email: normalizedEmail,
          phone: normalizedPhone,
          businessName: body.business_name,
          collectedData: {
            full_name: body.full_name,
            email: normalizedEmail,
            phone: normalizedPhone || undefined,
            business_name: body.business_name,
            business_age: body.business_age,
            monthly_revenue: body.monthly_revenue,
            credit_score_range: body.credit_score_range,
            funding_goal: body.funding_goal,
            industry: body.industry,
            state: body.state,
            has_business_credit: body.has_business_credit,
            has_bank_statements: body.has_bank_statements,
          },
          qualificationResult: body.qualificationResult,
        })

        console.info(`[Chatbot] CRM sync successful: ${newLead.id}`, {
          crmLeadId: crmResult.leadId,
          action: crmResult.action,
          duplicateRisk: crmResult.duplicateRisk,
        })
      } catch (crmErr) {
        console.error('[Chatbot] CRM sync error:', crmErr, {
          leadId: newLead.id,
          email: normalizedEmail,
        })
        // Log but don't fail - lead is still saved
      }
    }

    return NextResponse.json(
      {
        id: newLead.id,
        message: 'Lead saved successfully',
        quality: leadQuality,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Chatbot] Lead API error:', error, { ip: clientIp })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
