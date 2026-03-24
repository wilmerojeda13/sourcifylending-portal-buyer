import { createServiceClient } from '@/lib/supabase/server'
import { getAccountContext, logAgentAction } from '@/lib/agent-context'
import { updateProfileFromAgent } from './onboarding-agent'

// ─── Document Agent ───────────────────────────────────────────────────────────
// Runs when: a document is uploaded
// Responsibilities:
//   - classify the document type
//   - extract key fields
//   - auto-complete matching tasks if confidence is high
//   - update profile fields from verified document data
//   - flag mismatches or quality issues

const DOCUMENT_CATEGORIES = [
  'ein_letter',
  'articles_of_incorporation',
  'operating_agreement',
  'bank_statement',
  'credit_report',
  'business_credit_report',
  'certificate_of_good_standing',
  'vendor_confirmation',
  'card_approval',
  'tax_return',
  'voided_check',
  'other',
] as const

type DocumentCategory = typeof DOCUMENT_CATEGORIES[number]

interface ClassificationResult {
  category: DocumentCategory
  confidence: 'high' | 'medium' | 'low'
  extractedFields: Record<string, string>
  flags: string[]
}

// ─── Classify a document by filename and content hint ────────────────────────
function classifyDocument(fileName: string, mimeType: string): ClassificationResult {
  const name = fileName.toLowerCase()
  const flags: string[] = []
  const extractedFields: Record<string, string> = {}

  let category: DocumentCategory = 'other'
  let confidence: 'high' | 'medium' | 'low' = 'medium'

  if (name.includes('ein') || name.includes('employer_id') || name.includes('tax_id')) {
    category = 'ein_letter'
    confidence = 'high'
  } else if (name.includes('articles') || name.includes('incorporation') || name.includes('formation')) {
    category = 'articles_of_incorporation'
    confidence = 'high'
  } else if (name.includes('operating') && name.includes('agreement')) {
    category = 'operating_agreement'
    confidence = 'high'
  } else if (name.includes('bank') || name.includes('statement') || name.includes('checking') || name.includes('savings')) {
    category = 'bank_statement'
    confidence = 'high'
  } else if (name.includes('credit_report') || name.includes('creditreport') || name.includes('experian') || name.includes('equifax') || name.includes('transunion')) {
    category = 'credit_report'
    confidence = 'high'
  } else if (name.includes('business_credit') || name.includes('dnb') || name.includes('dun') || name.includes('paydex')) {
    category = 'business_credit_report'
    confidence = 'high'
  } else if (name.includes('good_standing') || name.includes('certificate') || name.includes('standing')) {
    category = 'certificate_of_good_standing'
    confidence = 'high'
  } else if (name.includes('uline') || name.includes('quill') || name.includes('grainger') || name.includes('vendor') || name.includes('net30') || name.includes('net_30')) {
    category = 'vendor_confirmation'
    confidence = 'high'
  } else if (name.includes('approval') || name.includes('card') || name.includes('credit_card') || name.includes('approved')) {
    category = 'card_approval'
    confidence = 'medium'
  } else if (name.includes('tax') && (name.includes('return') || name.includes('1040') || name.includes('1120'))) {
    category = 'tax_return'
    confidence = 'high'
  } else if (name.includes('void') || name.includes('check')) {
    category = 'voided_check'
    confidence = 'high'
  } else {
    confidence = 'low'
    flags.push('unrecognized_document_type')
  }

  // Flag non-PDF/image uploads
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    flags.push('non_standard_format')
  }

  return { category, confidence, extractedFields, flags }
}

// ─── Map document category to task titles it can auto-complete ────────────────
const CATEGORY_TASK_MAP: Partial<Record<DocumentCategory, string[]>> = {
  ein_letter: [
    'Confirm EIN is active',
    'Prepare business documentation package',
  ],
  articles_of_incorporation: [
    'Verify legal entity status',
  ],
  certificate_of_good_standing: [
    'Verify legal entity status',
  ],
  bank_statement: [
    'Complete Banking Snapshot',
  ],
  credit_report: [
    'Pull and review personal credit reports',
    'Document current credit score and utilization',
    'Complete Credit Snapshot',
  ],
  business_credit_report: [
    'Confirm tradeline reporting to bureaus',
    'Verify PAYDEX score at 80+',
    'Confirm 12+ reporting tradelines',
  ],
  vendor_confirmation: [
    'Open first vendor net-30 account',
    'Open second vendor net-30 account',
    'Open third vendor net-30 account',
    'Upload vendor account confirmations',
  ],
  card_approval: [
    'Upload card approval confirmations',
    'Submit first card application',
    'Submit second card application',
    'Submit third card application',
  ],
}

// ─── Main document agent runner ───────────────────────────────────────────────
export async function runDocumentAgent(userId: string, documentId: string): Promise<{ actionsCount: number }> {
  const supabase = await createServiceClient()
  const ctx = await getAccountContext(userId)
  if (!ctx || ctx.isDemo) return { actionsCount: 0 }

  // Fetch the specific document
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (!doc) return { actionsCount: 0 }

  let actionsCount = 0

  // 1. Classify the document
  const result = classifyDocument(doc.file_name ?? '', doc.mime_type ?? '')

  // Update document record with classification
  await supabase.from('documents').update({
    category:       result.category,
    extracted_data: {
      ...result.extractedFields,
      classification_confidence: result.confidence,
      classification_flags:      result.flags,
    },
  }).eq('id', documentId)

  // Log classification
  const categoryLabel = result.category.replace(/_/g, ' ')
  await logAgentAction({
    userId,
    agentName:   'document',
    actionType:  'document_classified',
    title:       `Analyzed your ${categoryLabel}`,
    description: `Document classified as "${categoryLabel}" with ${result.confidence} confidence.${result.flags.length > 0 ? ` Notes: ${result.flags.join(', ')}.` : ''}`,
    status:      'completed',
    autoFixed:   false,
    visibleToUser: true,
    metadata: {
      document_id: documentId,
      file_name:   doc.file_name,
      category:    result.category,
      confidence:  result.confidence,
      flags:       result.flags,
    },
  })
  actionsCount++

  // 2. Flag quality issues
  if (result.confidence === 'low') {
    await logAgentAction({
      userId,
      agentName:    'document',
      actionType:   'flag_raised',
      title:        `Couldn't identify document: ${doc.file_name}`,
      description:  'This file could not be automatically classified. Please rename it clearly (e.g. "ein_letter.pdf") or contact support.',
      status:       'pending_approval',
      needsReview:  true,
      visibleToUser: true,
      metadata:     { document_id: documentId, file_name: doc.file_name },
    })
    actionsCount++
    return { actionsCount }
  }

  // 3. Auto-complete matching tasks (high confidence only)
  if (result.confidence === 'high') {
    const matchingTitles = CATEGORY_TASK_MAP[result.category] ?? []
    const matchingTasks = ctx.tasks.filter(t =>
      t.status === 'pending' &&
      t.requiresDocument &&
      matchingTitles.some(title => t.title.toLowerCase().includes(title.toLowerCase().slice(0, 20)))
    )

    for (const task of matchingTasks) {
      const now = new Date().toISOString()
      await supabase.from('tasks').update({ status: 'completed', completed_at: now }).eq('task_id', task.taskId)

      // Unlock next task
      const taskIdx = ctx.tasks.findIndex(t => t.taskId === task.taskId)
      if (taskIdx >= 0 && taskIdx < ctx.tasks.length - 1) {
        const nextTask = ctx.tasks[taskIdx + 1]
        if (nextTask.status === 'locked') {
          await supabase.from('tasks').update({ status: 'pending' }).eq('task_id', nextTask.taskId)
        }
      }

      await logAgentAction({
        userId,
        agentName:   'document',
        actionType:  'task_completed',
        title:       `Completed task: "${task.title}"`,
        description: `Your ${categoryLabel} upload satisfied this task requirement automatically.`,
        status:      'completed',
        autoFixed:   true,
        visibleToUser: true,
        metadata:    { task_id: task.taskId, document_id: documentId },
      })
      actionsCount++
    }
  }

  // 4. Update profile fields from EIN letter
  if (result.category === 'ein_letter' && result.confidence === 'high') {
    const updates: Record<string, unknown> = {}
    if (result.extractedFields.ein)           updates.ein = result.extractedFields.ein
    if (result.extractedFields.business_name) updates.business_name = result.extractedFields.business_name

    if (Object.keys(updates).length > 0) {
      await updateProfileFromAgent(userId, updates, 'EIN letter')
      actionsCount++
    }
  }

  return { actionsCount }
}
