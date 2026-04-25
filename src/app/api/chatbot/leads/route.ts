import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

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
}

// Simple rate limiting per IP
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitStore.get(ip)

  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 60 * 60 * 1000 }) // 1 hour
    return true
  }

  if (record.count >= 5) {
    return false
  }

  record.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown'

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      )
    }

    const body: LeadRequest = await request.json()

    // Validate required fields
    if (!body.full_name || !body.email || !body.business_name) {
      return NextResponse.json(
        { error: 'Missing required fields: full_name, email, business_name' },
        { status: 400 }
      )
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    // Basic phone validation (if provided)
    if (body.phone && !/^\d{10}$/.test(body.phone.replace(/\D/g, ''))) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // Check for duplicate by email + source
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('email', body.email)
      .eq('source', 'chatbot')
      .single()

    if (existingLead) {
      return NextResponse.json(
        { id: existingLead.id, message: 'Lead already exists' },
        { status: 200 }
      )
    }

    // Insert lead
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        full_name: body.full_name,
        email: body.email,
        phone: body.phone || null,
        business_name: body.business_name,
        business_age: body.business_age || null,
        monthly_revenue: body.monthly_revenue || null,
        credit_score_range: body.credit_score_range || null,
        funding_goal: body.funding_goal || null,
        industry: body.industry || null,
        state: body.state || null,
        has_business_credit: body.has_business_credit || false,
        has_bank_statements: body.has_bank_statements || false,
        source: 'chatbot',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Database error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save lead' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { id: newLead.id, message: 'Lead saved successfully' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Lead API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
