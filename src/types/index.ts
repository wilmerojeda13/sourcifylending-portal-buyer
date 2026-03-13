// ─── Programs ─────────────────────────────────────────────────────────────────
export type ProgramId = 'program_a' | 'program_b' | 'program_c'
export type AccountState = 'prospect' | 'active_member'

export interface Program {
  id: ProgramId
  name: string
  description: string
  stages: Stage[]
}

export interface Stage {
  id: string
  name: string
  order: number
  description: string
}

// ─── Readiness ────────────────────────────────────────────────────────────────
export type ReadinessStatus = 'Ready' | 'Conditionally Ready' | 'Not Ready'

// ─── Analyzer ─────────────────────────────────────────────────────────────────
export interface AnalyzerInput {
  business_name: string
  business_age: string
  entity_type: string
  industry: string
  monthly_revenue_range: string
  monthly_deposit_range: string
  nsf_last_90_days: boolean
  credit_score_range: string
  utilization_range: string
  inquiry_count_last_90_days: string
  business_credit_reporting_status: string
  primary_goal: 'business_cards' | 'build_ein_credit' | 'stay_ready'
}

export interface AnalyzerResult {
  readiness_status: ReadinessStatus
  assigned_program: ProgramId
  risk_flags: string[]
  summary: string
  recommendation: string
}

// ─── User Profile ─────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string
  full_name: string
  email: string
  business_name: string | null
  business_age: string | null
  entity_type: string | null
  industry: string | null
  monthly_revenue_range: string | null
  monthly_deposit_range: string | null
  nsf_flag: boolean
  credit_score_range: string | null
  utilization_range: string | null
  inquiry_range: string | null
  business_credit_reporting_status: string | null
  assigned_program: ProgramId | null
  readiness_status: ReadinessStatus | null
  current_stage: string | null
  next_task_id: string | null
  progress_percentage: number
  subscription_status: SubscriptionStatus
  portal_blocked: boolean
  is_demo: boolean
  is_admin: boolean
  admin_notes: string | null
  notion_page_id: string | null
  // AI usage overrides
  ai_suspended: boolean
  ai_custom_monthly_credits: number | null
  ai_custom_daily_cap: number | null
  ai_custom_heavy_limit: number | null
  ai_access_notes: string | null
  // Prospect / free account
  account_state: AccountState
  lead_id: string | null
  latest_analyzer_result: AnalyzerResult | null
  analyzed_at: string | null
  created_at: string
  updated_at: string
}

// ─── Subscription ─────────────────────────────────────────────────────────────
export type SubscriptionStatus = 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing'

export interface Subscription {
  id: string
  user_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: SubscriptionStatus
  program: ProgramId | null
  current_period_start: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export type TaskStatus = 'pending' | 'completed' | 'locked' | 'overdue'

export interface Task {
  task_id: string
  user_id: string
  program: ProgramId
  stage: string
  title: string
  description: string
  status: TaskStatus
  due_date: string | null
  requires_document: boolean
  completed_at: string | null
  sort_order: number
  created_at: string
}

// ─── Documents ────────────────────────────────────────────────────────────────
export type DocumentType =
  | 'personal_credit_report'
  | 'business_formation'
  | 'ein_letter'
  | 'bank_statement'
  | 'vendor_confirmation'
  | 'other'

export type ReviewStatus = 'pending' | 'reviewed' | 'approved' | 'rejected'

export interface Document {
  document_id: string
  user_id: string
  document_type: DocumentType
  file_url: string
  file_name: string
  file_size: number
  uploaded_at: string
  review_status: ReviewStatus
  notes: string | null
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export type ReportType =
  | 'credit_readiness_summary'
  | 'funding_readiness_analysis'
  | 'tradeline_progress_report'
  | 'monthly_monitoring_report'
  | 'next_step_summary'

export interface Report {
  report_id: string
  user_id: string
  report_type: ReportType
  generated_at: string
  content: string
  title: string
}

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotificationType = 'reminder' | 'task_due' | 'report_ready' | 'ai_update' | 'system'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  created_at: string
}

// ─── Agreements ───────────────────────────────────────────────────────────────
export interface Agreement {
  id: string
  user_id: string
  program: ProgramId
  agreement_version: string
  accepted_at: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ─── Activity Logs ────────────────────────────────────────────────────────────
export type ActivityEventType =
  | 'signup'
  | 'login'
  | 'analyzer_completed'
  | 'agreement_accepted'
  | 'checkout_started'
  | 'checkout_completed'
  | 'subscription_reactivated'
  | 'subscription_canceled'
  | 'payment_failed'
  | 'task_completed'
  | 'document_uploaded'
  | 'report_generated'
  | 'portal_accessed'
  | 'portal_blocked'
  | 'portal_unblocked'
  | 'notification_sent'
  | 'admin_profile_updated'

export interface ActivityLog {
  id: string
  user_id: string
  event_type: ActivityEventType
  event_data: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ─── Account Opportunities ────────────────────────────────────────────────────
export type OpportunityCategory = 'funding' | 'vendor' | 'store' | 'fleet' | 'cash' | 'monitoring'
export type OpportunityPG = 'yes' | 'no' | 'varies'

export interface AccountOpportunity {
  id: string
  name: string
  program: string
  stage: string
  category: OpportunityCategory
  reports_to: string | null
  terms: string | null
  pg_required: OpportunityPG
  description: string | null
  learn_more_url: string | null
  apply_url: string | null
  priority_score: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── CRM: Contact Notes ────────────────────────────────────────────────────────
export interface ContactNote {
  id: string
  user_id: string
  admin_email: string | null
  note: string
  pinned: boolean
  created_at: string
  updated_at: string
}

// ─── CRM: Tickets ─────────────────────────────────────────────────────────────
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Ticket {
  id: string
  user_id: string
  created_by_email: string | null
  title: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  category: string
  resolution: string | null
  created_at: string
  updated_at: string
}

// ─── AI Agent ─────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AgentContext {
  profile: UserProfile
  tasks: Task[]
  documents: Document[]
  reports: Report[]
  notifications: Notification[]
}

// ─── AI Usage System ───────────────────────────────────────────────────────────
export type AIActionType =
  | 'simple_chat'
  | 'guided_recommendation'
  | 'analyzer_interpretation'
  | 'dispute_letter_generation'
  | 'funding_strategy_response'
  | 'document_review'
  | 'file_analysis'
  | 'heavy_agent_workflow'
  | 'underwriting_or_multi_step_deep_analysis'

export interface AIProgramLimits {
  id: string
  program: ProgramId
  monthly_credits: number
  daily_credit_cap: number
  max_requests_per_hour: number
  max_heavy_actions_per_day: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AIActionCost {
  id: string
  action_type: AIActionType
  credit_cost: number
  is_heavy: boolean
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserAIBalance {
  id: string
  user_id: string
  program: ProgramId | null
  billing_period_start: string
  billing_period_end: string
  credits_allocated: number
  credits_used: number
  credits_remaining: number
  daily_credits_used: number
  heavy_actions_used_today: number
  last_daily_reset: string
  created_at: string
  updated_at: string
}

export interface UserAIUsageEvent {
  id: string
  user_id: string
  program: ProgramId | null
  action_type: AIActionType
  credits_charged: number
  estimated_cost_usd: number
  model_used: string | null
  request_status: 'success' | 'failed' | 'blocked'
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export interface AICreditAdjustment {
  id: string
  user_id: string
  adjustment_type: 'bonus' | 'deduction' | 'reset' | 'admin_override'
  credits_delta: number
  reason: string | null
  created_by: string | null
  created_at: string
}
