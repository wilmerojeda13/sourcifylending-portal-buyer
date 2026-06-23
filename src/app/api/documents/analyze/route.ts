import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkAIUsage, recordAIUsage } from '@/lib/ai-usage'
import { logMemoryEvent, updateMemoryProfile } from '@/lib/ai-memory'
import { getBusinessContext } from '@/lib/business-context'
import { createOpenAIText, extractJsonObject, getOpenAIModel, isOpenAIConfigured } from '@/lib/openai'

// ─── Static maps ──────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  personal_credit_report:    'Personal Credit Report',
  credit_score_report:       'Credit Score Report',
  inquiry_summary:           'Inquiry Summary',
  business_formation:        'Business Formation Document',
  articles_of_organization:  'Articles of Organization / Incorporation',
  ein_letter:                'IRS EIN Confirmation Letter',
  bank_statement:            'Business Bank Statement',
  vendor_confirmation:       'Vendor Confirmation / Net-30 Account',
  vendor_account_screenshot: 'Vendor Account Screenshot',
  bureau_profile_screenshot: 'Business Bureau Profile Screenshot',
  driver_license:            'Driver License / Government ID',
  utility_bill:              'Utility Bill / Address Proof',
  voided_check:              'Voided Check',
  business_license:          'Business License / Permit',
  duns_confirmation:         'D-U-N-S Number Confirmation',
  monitoring_report:         'Credit Monitoring Report',
  other:                     'Supporting Document',
}

// Map document type → business_credibility checklist keys to auto-complete
const DOC_TO_CREDIBILITY: Record<string, string[]> = {
  ein_letter:               ['ein_obtained'],
  bank_statement:           ['business_bank_account'],
  voided_check:             ['business_bank_account'],
  duns_confirmation:        ['duns_registered'],
  business_license:         ['business_license'],
  utility_bill:             ['business_address'],
  articles_of_organization: ['entity_formed'],
  business_formation:       ['entity_formed'],
  bureau_profile_screenshot: ['experian_business_profile'],
}

// Map document type → keywords for fuzzy-matching tasks table titles
const DOC_TO_TASK_KEYWORDS: Record<string, string[]> = {
  ein_letter:               ['ein', 'tax id', 'federal tax'],
  bank_statement:           ['bank account', 'bank statement'],
  voided_check:             ['bank account', 'voided check'],
  duns_confirmation:        ['duns', 'd-u-n-s'],
  business_license:         ['business license', 'license', 'permit'],
  articles_of_organization: ['articles', 'formation', 'incorporate'],
  utility_bill:             ['address', 'utility'],
  personal_credit_report:   ['credit report', 'submit credit'],
  credit_score_report:      ['credit report', 'credit score'],
}

// ─── Program-aware prompt builder ─────────────────────────────────────────────

interface ProfileSnapshot {
  assigned_program?: string | null
  current_stage?: string | null
  business_name?: string | null
  entity_type?: string | null
  credit_score_range?: string | null
  utilization_range?: string | null
  inquiry_range?: string | null
}

function buildSystemPrompt(program: string | null, profile: ProfileSnapshot): string {
  const validDocTypes = Object.keys(DOC_TYPE_LABELS).join(', ')

  if (program === 'program_a') {
    return `You are an expert personal credit document analyst for a 0% Intro APR / personal credit advisory program.

CLIENT PROGRAM: Program A — Personal Credit & 0% Intro APR Strategy
Client's profile on file:
- Credit score range: ${profile.credit_score_range ?? 'not yet recorded'}
- Utilization range: ${profile.utilization_range ?? 'not yet recorded'}
- Inquiry range (last 90 days): ${profile.inquiry_range ?? 'not yet recorded'}

Your task: analyze the uploaded document and return a precise JSON assessment focused on personal credit optimization.

Return ONLY valid JSON — no markdown, no text outside the JSON object.

Valid document types: ${validDocTypes}

Required JSON structure:
{
  "detected_type": "<document type value>",
  "matches_declared_type": <true|false>,
  "is_valid": <true|false>,
  "confidence": "<high|medium|low>",
  "validation_summary": "<1-2 sentence summary of what you found and its acceptability>",
  "rejection_reason": <null or "short reason if is_valid is false">,
  "extracted_fields": {
    "credit_bureau": "<Experian|Equifax|TransUnion|other — if visible>",
    "score": "<numeric score if visible>",
    "report_date": "<date if visible>"
  },
  "tasks_to_complete": [],
  "next_step_guidance": "<1 sentence: specific next action for this Program A client>",
  "recommendation": "<approved|needs_review|rejected>",
  "credit_insights": {
    "estimated_score_range": "<300-579|580-619|620-659|660-699|700-739|740-799|800+ — or null>",
    "utilization_pct": "<percentage like 38% — or null if not visible>",
    "inquiry_count": <number of recent inquiries visible, or null>,
    "negative_accounts": <count of negative/derogatory accounts visible, or null>,
    "recommendations": [
      "<specific optimization action this client should take>",
      "<another specific action>"
    ]
  },
  "profile_updates": {
    "credit_score_range": "<must be one of: 300-579|580-619|620-659|660-699|700-739|740-799|800+ — omit if not clearly visible>",
    "utilization_range": "<must be one of: 0-9%|10-29%|30-49%|50-74%|75%+ — omit if not clearly visible>",
    "inquiry_range": "<must be one of: 0|1-2|3-5|6+ — omit if not clearly visible>"
  }
}

Rules:
- credit_insights must always be present for any credit-related document; set fields to null if not determinable
- Only populate profile_updates with values you can clearly see — never guess
- recommendations must be specific and actionable, not generic
- For non-credit documents (e.g. driver license), credit_insights fields may all be null
- If the image is unclear, blurry, or unreadable, set is_valid to false`
  }

  if (program === 'program_b') {
    return `You are an expert business document analyst for a business credit building program.

CLIENT PROGRAM: Program B — Business Credit Builder
Client's profile on file:
- Business name: ${profile.business_name ?? 'not yet recorded'}
- Entity type: ${profile.entity_type ?? 'not yet recorded'}
- Current stage: ${profile.current_stage ?? 'Foundation'}

Your task: analyze the uploaded business document, verify identity/credibility, and return a JSON assessment that enables automatic task completion and profile updates.

Return ONLY valid JSON — no markdown, no text outside the JSON object.

Valid document types: ${validDocTypes}
Valid checklist keys: ein_obtained, business_bank_account, business_address, duns_registered, business_license, entity_formed, experian_business_profile

Required JSON structure:
{
  "detected_type": "<document type value>",
  "matches_declared_type": <true|false>,
  "is_valid": <true|false>,
  "confidence": "<high|medium|low>",
  "validation_summary": "<1-2 sentence summary — mention business name and key verified detail if visible>",
  "rejection_reason": <null or "short reason if is_valid is false">,
  "extracted_fields": {
    "business_name": "<if visible>",
    "ein": "<XX-XXXXXXX format if visible>",
    "entity_type": "<LLC|Corporation|Sole Proprietor|Partnership if visible>",
    "state": "<state of formation if visible>",
    "duns_number": "<9 digits if visible>",
    "date_issued": "<if visible>"
  },
  "tasks_to_complete": ["<checklist key>"],
  "next_step_guidance": "<1 sentence: next step for this Program B client>",
  "recommendation": "<approved|needs_review|rejected>",
  "business_identity": {
    "business_name": "<if clearly on document>",
    "ein": "<XX-XXXXXXX format if clearly on document>",
    "entity_type": "<LLC|Corporation|Sole Proprietor if clearly on document>",
    "state": "<state if clearly on document>",
    "address": "<full business address if clearly on document>",
    "duns_number": "<9-digit DUNS if clearly on document>"
  },
  "credit_profile_updates": {
    "duns_number": "<only if confirmed on a duns_confirmation or bureau_profile_screenshot>",
    "duns_status": "<registered|verified — only for duns-type documents>",
    "experian_status": "<registered|verified — only for experian bureau documents>"
  },
  "profile_updates": {
    "business_name": "<only if clearly printed on the document>",
    "entity_type": "<LLC|Corporation|Sole Proprietor — only if clearly on document>"
  }
}

Rules:
- Only auto-complete checklist items when confidence is HIGH and the document directly proves that item
- EIN letter → ein_obtained (high confidence only)
- Bank statement or voided check → business_bank_account
- DUNS confirmation → duns_registered
- Business license → business_license
- Articles of organization → entity_formed
- Utility bill / address proof → business_address
- Bureau profile screenshot → experian_business_profile (only if Experian)
- A vendor account screenshot does NOT auto-complete formal checklist items
- If confidence is medium or low, do not complete any checklist items
- Never populate credit_profile_updates fields unless the document specifically shows that data
- If the image is blurry or unreadable, set is_valid false`
  }

  if (program === 'program_c') {
    return `You are an expert credit monitoring analyst.

CLIENT PROGRAM: Program C — Credit Monitoring

Your task: analyze the uploaded monitoring report or credit document and return a JSON assessment focused on identifying changes, alerts, and recommended follow-up actions.

Return ONLY valid JSON — no markdown, no text outside the JSON object.

Valid document types: ${validDocTypes}

Required JSON structure:
{
  "detected_type": "<document type value>",
  "matches_declared_type": <true|false>,
  "is_valid": <true|false>,
  "confidence": "<high|medium|low>",
  "validation_summary": "<1-2 sentence summary of what this report shows>",
  "rejection_reason": <null or "short reason if is_valid is false">,
  "extracted_fields": {
    "score": "<credit score if visible>",
    "previous_score": "<prior score if comparison shown>",
    "report_date": "<date of report if visible>",
    "bureau": "<credit bureau name if visible>"
  },
  "tasks_to_complete": [],
  "next_step_guidance": "<1 sentence: most important next action based on this report>",
  "recommendation": "<approved|needs_review|rejected>",
  "monitoring_summary": "<2-3 sentence summary of key changes, trends, or notable items>",
  "alerts": [
    "<specific item that needs attention — e.g. 'New hard inquiry from Capital One on Jan 15'>",
    "<another specific alert>"
  ],
  "recommended_actions": [
    "<concrete, specific action the client should take>",
    "<another specific action>"
  ],
  "score_change": "<e.g. +12 or -5 — null if not determinable from this document>"
}

Rules:
- alerts should be specific and actionable, not vague
- recommended_actions must be concrete steps, not generic advice like 'maintain good habits'
- If no meaningful alerts are found, alerts can be an empty array
- monitoring_summary should always be present and substantive for valid monitoring documents
- If the image is blurry or unreadable, set is_valid false`
  }

  // Default prompt (no program assigned yet)
  return `You are an expert document analyst for a business and personal credit advisory platform.

Your task: analyze the uploaded document and return a precise structured JSON assessment.

Return ONLY valid JSON — no markdown, no text outside the JSON object.

Valid document types: ${validDocTypes}
Valid checklist keys for tasks_to_complete: ein_obtained, business_bank_account, business_address, duns_registered, business_license, entity_formed, experian_business_profile

Required JSON structure:
{
  "detected_type": "<document type value>",
  "matches_declared_type": <true|false>,
  "is_valid": <true|false>,
  "confidence": "<high|medium|low>",
  "validation_summary": "<1-2 sentence plain English summary>",
  "rejection_reason": <null or "short reason if is_valid is false">,
  "extracted_fields": { <key-value pairs of clearly visible data only> },
  "tasks_to_complete": [<checklist keys to auto-complete if is_valid and confidence is high>],
  "next_step_guidance": "<1 sentence: what the client should do next>",
  "recommendation": "<approved|needs_review|rejected>"
}

Rules:
- Only set is_valid true if the document is clearly readable and appears legitimate
- Only include extracted_fields that are clearly visible — never guess
- tasks_to_complete only for valid, high-confidence documents
- If the image is unclear, blurry, or unreadable, set is_valid false with a rejection_reason`
}

// ─── Helper: build a human-readable summary of what was updated ───────────────

function buildUpdatesSummary(
  program: string | null,
  analysis: Record<string, unknown>,
  updates: ProgramUpdates,
): string {
  const parts: string[] = []

  if (program === 'program_a') {
    if (updates.creditInsightsStored) parts.push('Credit optimization profile updated')
    if (updates.profileFieldsUpdated.includes('credit_score_range')) parts.push('Credit score range recorded')
    if (updates.profileFieldsUpdated.includes('utilization_range')) parts.push('Utilization range recorded')
    if (parts.length === 0 && analysis.is_valid) parts.push('Personal credit document analyzed')
  } else if (program === 'program_b') {
    if (updates.checklistCompletions.length > 0) {
      parts.push(`${updates.checklistCompletions.length} checklist item(s) auto-completed`)
    }
    if (updates.profileFieldsUpdated.includes('business_name')) parts.push('Business name on file')
    if (updates.tasksCompleted.length > 0) parts.push(`${updates.tasksCompleted.length} roadmap task(s) marked complete`)
    if (updates.bizCreditProfileUpdated) parts.push('Business credit profile updated')
    if (parts.length === 0 && analysis.is_valid) parts.push('Business document verified')
  } else if (program === 'program_c') {
    if (updates.monitoringUpdated) parts.push('Monitoring insights updated')
    const scoreChange = analysis.score_change as string | undefined
    if (scoreChange) parts.push(`Score change: ${scoreChange}`)
    if (parts.length === 0 && analysis.is_valid) parts.push('Monitoring report analyzed')
  } else {
    if (updates.checklistCompletions.length > 0) {
      parts.push(`${updates.checklistCompletions.length} checklist item(s) completed`)
    }
    if (updates.profileFieldsUpdated.length > 0) parts.push('Profile updated')
  }

  if (parts.length === 0) {
    return analysis.is_valid
      ? 'Document analyzed successfully'
      : 'Document requires review before any updates can be applied'
  }
  return parts.join(' · ')
}

interface ProgramUpdates {
  checklistCompletions: string[]
  tasksCompleted: string[]
  profileFieldsUpdated: string[]
  bizCreditProfileUpdated: boolean
  monitoringUpdated: boolean
  creditInsightsStored: boolean
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let parsedDocId: string | undefined

  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const context = await getBusinessContext()
    if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { document_id } = body
    parsedDocId = document_id
    if (!document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

    const supabase = await createServiceClient()

    // Fetch document AND profile in parallel
    const [{ data: doc, error: docErr }, { data: profile }] = await Promise.all([
      supabase.from('documents')
        .select('*')
        .eq('document_id', document_id)
        .eq('user_id', context.activeBusinessId)
        .single(),
      supabase.from('profiles')
        .select('assigned_program, current_stage, business_name, entity_type, credit_score_range, utilization_range, inquiry_range')
        .eq('id', context.activeBusinessId)
        .single(),
    ])

    if (docErr || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const program: string | null = profile?.assigned_program ?? null

    // Check AI credits (2 credits per analysis)
    const usageCheck = await checkAIUsage(user.id, 'file_analysis')
    if (!usageCheck.allowed) {
      await supabase.from('documents').update({
        ai_analysis_status: 'skipped',
        program,
      }).eq('document_id', document_id)
      return NextResponse.json({
        skipped: true,
        reason: 'Insufficient AI credits for document analysis. Upgrade your plan to enable automatic document review.',
      })
    }

    // Mark as analyzing
    await supabase.from('documents').update({
      ai_analysis_status: 'analyzing',
      program,
    }).eq('document_id', document_id)

    // Build prompt + determine model
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
    const declaredLabel = DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type
    const systemPrompt = buildSystemPrompt(program, profile ?? {})
    const maxTokens = program ? 1400 : 900  // program-aware responses are larger

    const userContent = isImage
      ? [
          {
            type: 'text' as const,
            text: `Declared document type: ${declaredLabel}\nFilename: ${doc.file_name}\n\nAnalyze this document image and return the JSON assessment.`,
          },
          {
            type: 'image_url' as const,
            image_url: { url: doc.file_url },
          },
        ]
      : `Declared document type: ${declaredLabel}\nFilename: ${doc.file_name}\nFile extension: .${ext}\n\nThis file type cannot be visually previewed. Base your analysis on the declared type and filename. If the filename clearly mismatches the declared type, flag it. Otherwise provide guidance appropriate for this document type.\n\nReturn the JSON assessment.`

    if (!isOpenAIConfigured()) {
      await supabase.from('documents').update({
        ai_analysis_status: 'failed',
        ai_analyzed_at: new Date().toISOString(),
      }).eq('document_id', document_id)
      return NextResponse.json({ error: 'AI analysis is unavailable because OpenAI is not configured.' }, { status: 503 })
    }

    const model = getOpenAIModel()
    const message = await createOpenAIText({
      model,
      system: systemPrompt,
      maxTokens,
      messages: [{ role: 'user', content: userContent }],
    })

    const rawContent = message.text || '{}'

    let analysis: Record<string, unknown>
    try {
      const cleaned = extractJsonObject(rawContent)
      analysis = JSON.parse(cleaned)
    } catch {
      await supabase.from('documents').update({
        ai_analysis_status: 'failed',
        ai_analyzed_at: new Date().toISOString(),
      }).eq('document_id', document_id)
      return NextResponse.json({ error: 'AI analysis could not be parsed. Please try again.' }, { status: 500 })
    }

    if (usageCheck.allowed) {
      await recordAIUsage(
        user.id,
        usageCheck.program,
        'file_analysis',
        usageCheck.creditCost,
        usageCheck.isHeavy,
        usageCheck.balanceId,
        'success',
        model,
        0,
        { provider: 'openai' },
        usageCheck.creditSource,
        usageCheck.purchasedBucketId,
      )
    }

    const isValid = analysis.is_valid === true
    const detectedType = (analysis.detected_type as string) ?? doc.document_type
    const now = new Date().toISOString()
    const extracted = (analysis.extracted_fields as Record<string, string>) ?? {}

    // Track everything that gets updated
    const updates: ProgramUpdates = {
      checklistCompletions: [],
      tasksCompleted: [],
      profileFieldsUpdated: [],
      bizCreditProfileUpdated: false,
      monitoringUpdated: false,
      creditInsightsStored: false,
    }

    // ── Auto-complete business_credibility checklist items ────────────────────
    const checklistKeys: string[] = isValid
      ? ((analysis.tasks_to_complete as string[]) ?? DOC_TO_CREDIBILITY[detectedType] ?? [])
      : []

    if (checklistKeys.length > 0) {
        await Promise.all(
        checklistKeys.map((itemKey) =>
          supabase.from('business_credibility_checklist').upsert(
            { user_id: context.activeBusinessId, item_key: itemKey, is_complete: true, completed_at: now, updated_at: now },
            { onConflict: 'user_id,item_key' }
          )
        )
      )
      updates.checklistCompletions = checklistKeys
    }

    // ── Fuzzy-complete matching tasks in the tasks table ──────────────────────
    if (isValid) {
      const keywords = DOC_TO_TASK_KEYWORDS[detectedType] ?? []
      if (keywords.length > 0) {
        const { data: matchingTasks } = await supabase
          .from('tasks')
          .select('task_id, title')
          .eq('user_id', context.activeBusinessId)
          .eq('status', 'pending')
          .or(keywords.map(k => `title.ilike.%${k}%`).join(','))

        if (matchingTasks && matchingTasks.length > 0) {
          await Promise.all(
            matchingTasks.map(t =>
              supabase.from('tasks').update({
                status: 'completed',
                completed_at: now,
              }).eq('task_id', t.task_id)
            )
          )
          updates.tasksCompleted = matchingTasks.map(t => t.title)
        }
      }
    }

    // ── Build profile updates ─────────────────────────────────────────────────
    // Start with any extracted fields, then overlay program-declared updates (higher priority)
    const profileTextUpdates: Record<string, string | null> = {}
    const profileJsonUpdates: Record<string, object> = {}

    if (extracted.business_name) profileTextUpdates.business_name = extracted.business_name

    const declaredProfileUpdates = (analysis.profile_updates as Record<string, string>) ?? {}
    Object.assign(profileTextUpdates, declaredProfileUpdates)

    // ── Program A: Credit optimization ────────────────────────────────────────
    if (program === 'program_a' && isValid) {
      const creditInsights = analysis.credit_insights as Record<string, unknown> | undefined
      if (creditInsights) {
        profileJsonUpdates.credit_optimization_insights = {
          ...creditInsights,
          analyzed_at: now,
          document_id,
          document_type: detectedType,
        }
        updates.creditInsightsStored = true

        // Remove from text updates — these are JSON fields, not text
        delete profileTextUpdates.credit_optimization_insights
      }
    }

    // ── Program B: Business identity + bureau profile ─────────────────────────
    if (program === 'program_b' && isValid) {
      const businessIdentity = analysis.business_identity as Record<string, string> | undefined
      const creditProfileUpdates = analysis.credit_profile_updates as Record<string, string> | undefined

      // Override profile text updates with business identity
      if (businessIdentity?.business_name) profileTextUpdates.business_name = businessIdentity.business_name
      if (businessIdentity?.entity_type) profileTextUpdates.entity_type = businessIdentity.entity_type
      if (businessIdentity?.ein) profileTextUpdates.uw_ein = businessIdentity.ein

      // Update business_credit_profile table
      if (creditProfileUpdates) {
        const bcp: Record<string, unknown> = { user_id: context.activeBusinessId, updated_at: now }
        if (creditProfileUpdates.duns_number) bcp.duns_number = creditProfileUpdates.duns_number
        if (creditProfileUpdates.duns_status) bcp.duns_status = creditProfileUpdates.duns_status
        if (creditProfileUpdates.experian_status) bcp.experian_status = creditProfileUpdates.experian_status

        if (Object.keys(bcp).length > 2) {
          await supabase.from('business_credit_profile')
            .upsert(bcp, { onConflict: 'user_id' })
          updates.bizCreditProfileUpdated = true
        }
      }
    }

    // ── Program C: Monitoring insights ────────────────────────────────────────
    if (program === 'program_c' && isValid) {
      profileJsonUpdates.monitoring_insights = {
        summary: analysis.monitoring_summary ?? null,
        alerts: analysis.alerts ?? [],
        recommended_actions: analysis.recommended_actions ?? [],
        score_change: analysis.score_change ?? null,
        analyzed_at: now,
        document_id,
      }
      updates.monitoringUpdated = true
    }

    // Apply all profile updates in one call
    const allProfileUpdates = { ...profileTextUpdates, ...profileJsonUpdates }
    if (Object.keys(allProfileUpdates).length > 0) {
      await supabase.from('profiles').update(allProfileUpdates).eq('id', context.activeBusinessId)
      updates.profileFieldsUpdated = Object.keys(allProfileUpdates)
    }

    // ── Build program updates summary ─────────────────────────────────────────
    const programUpdatesSummary = buildUpdatesSummary(program, analysis, updates)

    // ── Final document record update ──────────────────────────────────────────
    const finalAnalysis = { ...analysis, program_updates_summary: programUpdatesSummary }

    await supabase.from('documents').update({
      ai_analysis_status: 'completed',
      ai_analysis: finalAnalysis,
      ai_analyzed_at: now,
      program,
      ai_program_updates: {
        program,
        checklist_completions: updates.checklistCompletions,
        tasks_completed: updates.tasksCompleted,
        profile_fields_updated: updates.profileFieldsUpdated,
        biz_credit_profile_updated: updates.bizCreditProfileUpdated,
        monitoring_updated: updates.monitoringUpdated,
        credit_insights_stored: updates.creditInsightsStored,
      },
      ...(analysis.recommendation === 'approved' ? { review_status: 'approved' } : {}),
    }).eq('document_id', document_id)

    // ── Audit log (fire-and-forget) ───────────────────────────────────────────
    void supabase.from('document_audit_log').insert({
      document_id,
      user_id: context.activeBusinessId,
      program,
      detected_type: detectedType,
      extracted_fields: extracted,
      validation_result: analysis.recommendation as string,
      tasks_updated: [...updates.checklistCompletions, ...updates.tasksCompleted],
      profile_fields_updated: updates.profileFieldsUpdated,
    })

    // ── AI Memory update ──────────────────────────────────────────────────────
    const typeLabel = DOC_TYPE_LABELS[detectedType] ?? detectedType
    const memoryTitle = `Document analyzed: ${typeLabel} — ${analysis.recommendation ?? 'unknown'}`

    const memoryParts: string[] = [`Summary: ${analysis.validation_summary}`]
    if (program === 'program_a') {
      const ci = analysis.credit_insights as Record<string, unknown> | undefined
      if (ci?.estimated_score_range) memoryParts.push(`Credit score: ${ci.estimated_score_range}`)
      if (ci?.utilization_pct) memoryParts.push(`Utilization: ${ci.utilization_pct}`)
      if (ci?.inquiry_count != null) memoryParts.push(`Inquiries: ${ci.inquiry_count}`)
    } else if (program === 'program_b') {
      if (extracted.business_name) memoryParts.push(`Business: ${extracted.business_name}`)
      if (extracted.ein) memoryParts.push(`EIN: ${extracted.ein}`)
      if (updates.checklistCompletions.length > 0) {
        memoryParts.push(`Auto-completed: ${updates.checklistCompletions.join(', ')}`)
      }
    } else if (program === 'program_c') {
      const ms = analysis.monitoring_summary as string | undefined
      if (ms) memoryParts.push(`Monitoring: ${ms.slice(0, 150)}`)
    }
    if (analysis.next_step_guidance) memoryParts.push(`Next: ${analysis.next_step_guidance}`)

    logMemoryEvent(
      context.activeBusinessId,
      'document_reviewed',
      memoryTitle,
      memoryParts.join(' | '),
      document_id,
    ).catch(() => {})

    // Persist next steps and business name to memory profile
    updateMemoryProfile(context.activeBusinessId, {
      ...(analysis.next_step_guidance ? { next_steps: analysis.next_step_guidance as string } : {}),
      ...(!profile?.business_name && extracted.business_name ? { business_name: extracted.business_name } : {}),
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      analysis: finalAnalysis,
      program_updates: updates,
      tasks_completed: updates.checklistCompletions,
      tasks_completed_titles: updates.tasksCompleted,
      profile_fields_updated: updates.profileFieldsUpdated,
      updates_summary: programUpdatesSummary,
    })

  } catch (err) {
    console.error('[DocAnalysis] Error:', err)
    if (parsedDocId) {
      try {
        const supabase = await createServiceClient()
        await supabase.from('documents').update({
          ai_analysis_status: 'failed',
          ai_analyzed_at: new Date().toISOString(),
        }).eq('document_id', parsedDocId)
      } catch { /* ignore */ }
    }
    return NextResponse.json({ error: 'Document analysis failed. Please try again.' }, { status: 500 })
  }
}
