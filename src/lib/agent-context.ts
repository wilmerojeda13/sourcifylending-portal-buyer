import { createServiceClient } from '@/lib/supabase/server'

// ─── Shared Account Context ───────────────────────────────────────────────────
// Every agent reads from this object. Single source of truth per invocation.

export interface AccountContext {
  userId: string
  email: string | null
  fullName: string | null
  businessName: string | null
  assignedProgram: string | null
  accountState: string | null
  subscriptionStatus: string | null
  currentStage: string | null
  entityType: string | null
  industry: string | null
  creditScoreRange: string | null
  isDemo: boolean

  // Underwriting
  underwritingCompletedAt: string | null
  underwritingNextDue: string | null
  uwApprovalLikelihood: string | null
  uwRiskLevel: string | null
  uwDisqualified: boolean

  // Tasks
  tasks: {
    taskId: string
    title: string
    stage: string
    status: string
    requiresDocument: boolean
    completedAt: string | null
  }[]
  completedTaskCount: number
  pendingTaskCount: number
  lockedTaskCount: number

  // Documents
  documents: {
    id: string
    fileName: string
    fileType: string | null
    category: string | null
    uploadedAt: string
    extractedData: Record<string, unknown> | null
  }[]

  // Billing
  stripeCustomerId: string | null
  setupFeePaid: boolean
  lastPaymentDate: string | null

  // Recent agent activity
  recentAgentActions: {
    id: string
    agentName: string
    title: string
    status: string
    createdAt: string
  }[]

  // Flags
  missingFields: string[]
  hasCompletedUnderwriting: boolean
  hasGeneratedRoadmap: boolean
  isNewAccount: boolean
}

export async function getAccountContext(userId: string): Promise<AccountContext | null> {
  const supabase = await createServiceClient()

  const [
    { data: profile },
    { data: tasks },
    { data: documents },
    { data: recentActions },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('tasks').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('agent_actions').select('id, agent_name, title, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
  ])

  if (!profile) return null

  const taskList = tasks ?? []
  const docList = documents ?? []

  // Detect missing required fields
  const missingFields: string[] = []
  if (!profile.business_name) missingFields.push('business_name')
  if (!profile.entity_type)   missingFields.push('entity_type')
  if (!profile.industry)      missingFields.push('industry')
  if (!profile.phone)         missingFields.push('phone')

  const accountAgeMs = profile.created_at
    ? Date.now() - new Date(profile.created_at).getTime()
    : Infinity
  const isNewAccount = accountAgeMs < 7 * 24 * 60 * 60 * 1000 // < 7 days

  return {
    userId,
    email:               profile.email ?? null,
    fullName:            profile.full_name ?? null,
    businessName:        profile.business_name ?? null,
    assignedProgram:     profile.assigned_program ?? null,
    accountState:        profile.member_status ?? null,
    subscriptionStatus:  profile.billing_status ?? null,
    currentStage:        profile.current_stage ?? null,
    entityType:          profile.entity_type ?? null,
    industry:            profile.industry ?? null,
    creditScoreRange:    profile.credit_score_range ?? null,
    isDemo:              profile.is_demo ?? false,

    underwritingCompletedAt: profile.underwriting_completed_at ?? null,
    underwritingNextDue:     profile.underwriting_next_due_at ?? null,
    uwApprovalLikelihood:    profile.uw_approval_likelihood ?? null,
    uwRiskLevel:             profile.uw_risk_level ?? null,
    uwDisqualified:          profile.uw_disqualified ?? false,

    tasks: taskList.map(t => ({
      taskId:          t.task_id,
      title:           t.title,
      stage:           t.stage,
      status:          t.status,
      requiresDocument: t.requires_document,
      completedAt:     t.completed_at ?? null,
    })),
    completedTaskCount: taskList.filter(t => t.status === 'completed').length,
    pendingTaskCount:   taskList.filter(t => t.status === 'pending').length,
    lockedTaskCount:    taskList.filter(t => t.status === 'locked').length,

    documents: docList.map(d => ({
      id:            d.id,
      fileName:      d.file_name,
      fileType:      d.file_type ?? null,
      category:      d.category ?? null,
      uploadedAt:    d.created_at,
      extractedData: d.extracted_data ?? null,
    })),

    stripeCustomerId: profile.stripe_customer_id ?? null,
    setupFeePaid:     profile.setup_fee_paid ?? false,
    lastPaymentDate:  profile.last_payment_date ?? null,

    recentAgentActions: (recentActions ?? []).map(a => ({
      id:        a.id,
      agentName: a.agent_name,
      title:     a.title,
      status:    a.status,
      createdAt: a.created_at,
    })),

    missingFields,
    hasCompletedUnderwriting: !!profile.underwriting_completed_at,
    hasGeneratedRoadmap:      taskList.length > 0,
    isNewAccount,
  }
}

// ─── Log an agent action ──────────────────────────────────────────────────────
export async function logAgentAction(action: {
  userId: string
  agentName: string
  actionType: string
  title: string
  description?: string
  status?: string
  autoFixed?: boolean
  needsReview?: boolean
  visibleToUser?: boolean
  metadata?: Record<string, unknown>
}) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('agent_actions').insert({
    user_id:         action.userId,
    agent_name:      action.agentName,
    action_type:     action.actionType,
    title:           action.title,
    description:     action.description ?? null,
    status:          action.status ?? 'completed',
    auto_fixed:      action.autoFixed ?? false,
    needs_review:    action.needsReview ?? false,
    visible_to_user: action.visibleToUser ?? true,
    metadata:        action.metadata ?? {},
  })
  if (error) console.error('[AgentLog] Failed to log action:', error.message)
}
