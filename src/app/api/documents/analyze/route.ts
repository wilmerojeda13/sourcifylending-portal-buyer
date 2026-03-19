import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { checkAIUsage, recordAIUsage } from '@/lib/ai-usage'
import { logMemoryEvent } from '@/lib/ai-memory'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Map detected document types to business_credibility checklist keys
const DOC_TYPE_TO_TASKS: Record<string, string[]> = {
  ein_letter: ['ein_obtained'],
  bank_statement: ['business_bank_account'],
  duns_confirmation: ['duns_registered'],
  business_license: ['business_license'],
  articles_of_organization: [],  // no direct checklist match
  business_formation: [],
  driver_license: [],
  utility_bill: ['business_address'],
  voided_check: ['business_bank_account'],
  personal_credit_report: [],
  vendor_confirmation: [],
  other: [],
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { document_id } = await req.json()
    if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

    const supabase = await createServiceClient()

    // Fetch the document - verify ownership
    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('*')
      .eq('document_id', document_id)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check AI credits (2 credits for file_analysis)
    const usageCheck = await checkAIUsage(user.id, 'file_analysis')
    if (!usageCheck.allowed) {
      // Mark as skipped (no credits) — don't fail the upload
      await supabase.from('documents').update({
        ai_analysis_status: 'skipped',
      }).eq('document_id', document_id)
      return NextResponse.json({
        skipped: true,
        reason: 'Insufficient AI credits for document analysis. Upgrade your plan to enable automatic document review.',
      })
    }

    // Mark as analyzing
    await supabase.from('documents').update({ ai_analysis_status: 'analyzing' })
      .eq('document_id', document_id)

    // Determine if the file is an image we can send to GPT-4o vision
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)

    const docTypeLabels: Record<string, string> = {
      personal_credit_report: 'Personal Credit Report',
      business_formation: 'Business Formation Document',
      articles_of_organization: 'Articles of Organization / Incorporation',
      ein_letter: 'IRS EIN Confirmation Letter',
      bank_statement: 'Business Bank Statement',
      vendor_confirmation: 'Vendor Confirmation / Net-30 Account',
      driver_license: 'Driver License / Government ID',
      utility_bill: 'Utility Bill / Address Proof',
      voided_check: 'Voided Check',
      business_license: 'Business License / Permit',
      duns_confirmation: 'D-U-N-S Number Confirmation',
      other: 'Supporting Document',
    }

    const declaredLabel = docTypeLabels[doc.document_type] ?? doc.document_type

    const systemPrompt = `You are an expert business document analyst for a business credit advisory program.
Your task is to analyze an uploaded document and return a precise structured JSON assessment.

Return ONLY valid JSON — no markdown, no explanation outside the JSON object.

Required JSON structure:
{
  "detected_type": "<one of: ein_letter, bank_statement, business_formation, articles_of_organization, driver_license, utility_bill, voided_check, business_license, duns_confirmation, vendor_confirmation, personal_credit_report, other>",
  "matches_declared_type": <true|false>,
  "is_valid": <true|false>,
  "confidence": "<high|medium|low>",
  "validation_summary": "<1-2 sentence plain English summary of what you found and whether it is acceptable>",
  "rejection_reason": <null or "short reason if is_valid is false">,
  "extracted_fields": {<only fields clearly present — e.g. "ein": "12-3456789", "business_name": "...", "bank_name": "...", "statement_period": "...", "duns_number": "...">},
  "tasks_to_complete": [<array of checklist keys to auto-complete if is_valid is true — valid keys: ein_obtained, business_bank_account, business_address, duns_registered, business_license, experian_business_profile>],
  "next_step_guidance": "<1 sentence: what should the client do next based on this document>",
  "recommendation": "<approved|needs_review|rejected>"
}

Rules:
- Only set is_valid true if the document is clearly readable, appears legitimate, and matches the declared type
- Only include extracted_fields that are clearly visible — never guess
- tasks_to_complete should only include keys for valid, accepted documents
- If the image is unclear, blurry, or unreadable, set is_valid false with rejection_reason explaining why`

    const userContent = isImage
      ? [
          {
            type: 'text' as const,
            text: `Declared document type: ${declaredLabel}\nFilename: ${doc.file_name}\n\nAnalyze this document image and return the JSON assessment.`,
          },
          {
            type: 'image_url' as const,
            image_url: { url: doc.file_url, detail: 'high' as const },
          },
        ]
      : `Declared document type: ${declaredLabel}\nFilename: ${doc.file_name}\nFile extension: .${ext}\n\nNote: This file type (${ext}) cannot be visually previewed. Base your analysis on the declared type, filename, and common document characteristics. If the filename is clearly mismatched from the declared type, flag it. Otherwise, provide guidance appropriate for this document type.\n\nReturn the JSON assessment.`

    const model = isImage ? 'gpt-4o' : 'gpt-4o-mini'

    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 800,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: userContent,
        },
      ],
    })

    const rawContent = completion.choices[0]?.message?.content ?? '{}'

    // Parse JSON — strip any accidental markdown fences
    let analysis: Record<string, unknown>
    try {
      const cleaned = rawContent.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim()
      analysis = JSON.parse(cleaned)
    } catch {
      // Analysis failed to parse — mark as failed
      await supabase.from('documents').update({
        ai_analysis_status: 'failed',
        ai_analyzed_at: new Date().toISOString(),
      }).eq('document_id', document_id)
      return NextResponse.json({ error: 'AI analysis could not be parsed. Please try again.' }, { status: 500 })
    }

    // Record AI usage
    await recordAIUsage(user.id, 'file_analysis')

    // Auto-complete business_credibility tasks if valid
    const isValid = analysis.is_valid === true
    const detectedType = (analysis.detected_type as string) ?? doc.document_type
    const tasksToComplete: string[] = isValid
      ? ((analysis.tasks_to_complete as string[]) ?? DOC_TYPE_TO_TASKS[detectedType] ?? [])
      : []

    if (tasksToComplete.length > 0) {
      const now = new Date().toISOString()
      await Promise.all(
        tasksToComplete.map((itemKey) =>
          supabase.from('business_credibility').upsert(
            { user_id: user.id, item_key: itemKey, is_complete: true, completed_at: now, updated_at: now },
            { onConflict: 'user_id,item_key' }
          )
        )
      )
    }

    // Prefill profile fields from extracted data
    const extracted = (analysis.extracted_fields as Record<string, string>) ?? {}
    const profileUpdates: Record<string, string> = {}
    if (extracted.business_name) profileUpdates.business_name = extracted.business_name
    if (Object.keys(profileUpdates).length > 0) {
      await supabase.from('profiles').update(profileUpdates).eq('id', user.id)
    }

    // Update document with analysis result
    const now = new Date().toISOString()
    await supabase.from('documents').update({
      ai_analysis_status: 'completed',
      ai_analysis: analysis,
      ai_analyzed_at: now,
      // Auto-approve in review_status if AI recommends it
      ...(analysis.recommendation === 'approved' ? { review_status: 'approved' } : {}),
    }).eq('document_id', document_id)

    // Log memory event
    logMemoryEvent(
      user.id,
      'document_reviewed',
      `AI analyzed ${doc.document_type} document: ${analysis.validation_summary}`,
    ).catch(() => {})

    return NextResponse.json({
      success: true,
      analysis,
      tasks_completed: tasksToComplete,
    })
  } catch (err) {
    console.error('[DocAnalysis] Error:', err)
    // Mark as failed in DB
    try {
      const { document_id } = await (req as NextRequest).json().catch(() => ({}))
      if (document_id) {
        const supabase = await createServiceClient()
        await supabase.from('documents').update({
          ai_analysis_status: 'failed',
          ai_analyzed_at: new Date().toISOString(),
        }).eq('document_id', document_id)
      }
    } catch { /* ignore */ }
    return NextResponse.json({ error: 'Document analysis failed. Please try again.' }, { status: 500 })
  }
}
