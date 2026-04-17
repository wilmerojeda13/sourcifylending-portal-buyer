import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'

export const dynamic = 'force-dynamic'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const [{ data: profile }, { data: documents }, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', context.activeBusinessId).single(),
    supabase.from('documents').select('*').eq('user_id', context.activeBusinessId).order('uploaded_at', { ascending: false }),
    supabase.from('memberships').select('program_code').eq('user_id', context.activeBusinessId).eq('status', 'active'),
  ])

  const membershipPrograms = (membershipsResult?.data ?? []).map((membership: { program_code: string }) => membership.program_code).filter(Boolean)
  const activePrograms = membershipPrograms.length > 0 ? membershipPrograms : (profile?.assigned_program ? [profile.assigned_program] : [])
  const isActive = profile?.billing_status === 'active' || profile?.billing_status === 'trialing' || profile?.is_demo === true

  return NextResponse.json({
    profile,
    documents: documents ?? [],
    active_programs: activePrograms,
    is_active: isActive,
  })
}

export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const selectedType = typeof form.get('document_type') === 'string' ? (form.get('document_type') as string) : ''

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }

  if (!selectedType) {
    return NextResponse.json({ error: 'Document type is required' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${context.activeBusinessId}/${selectedType}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
  const uploadedAt = new Date().toISOString()

  const { data: document, error: insertError } = await supabase
    .from('documents')
    .insert({
      user_id: context.activeBusinessId,
      document_type: selectedType,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_size: file.size,
      uploaded_at: uploadedAt,
      review_status: 'pending',
    })
    .select('*')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', context.activeBusinessId)
    .order('uploaded_at', { ascending: false })

  return NextResponse.json({
    document,
    documents: documents ?? [],
  }, { status: 201 })
}
