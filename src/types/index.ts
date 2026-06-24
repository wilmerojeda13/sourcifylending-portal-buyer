// ─── Programs ─────────────────────────────────────────────────────────────────
export type ProgramId = 'program_a' | 'program_b' | 'program_c'
export type MemberStatus = 'prospect' | 'active_member'
// Backwards compatibility alias
export type AccountState = MemberStatus

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
  readiness_score: number
  estimated_funding_range: string
  assigned_program: ProgramId
  risk_flags: string[]
  top_blockers: string[]
  summary: string
  recommendation: string
  recommended_next_step: string
  upgrade_cta: string
  disclaimer: string
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
  billing_status: BillingStatus
  feature_tier: FeatureTier
  portal_blocked: boolean
  is_demo: boolean
  demo_access_scope?: 'free' | 'program_a' | 'program_b' | 'program_c' | 'all_access' | null
  is_admin: boolean
  admin_notes: string | null
  suspicious_signup?: boolean
  suspicious_signup_reason?: string | null
  signup_risk_score?: number | null
  signup_source?: string | null
  signup_last_ip?: string | null
  signup_last_user_agent?: string | null
  notion_page_id: string | null
  // AI usage overrides
  ai_suspended: boolean
  ai_custom_monthly_credits: number | null
  ai_custom_daily_cap: number | null
  ai_custom_heavy_limit: number | null
  ai_access_notes: string | null
  // Prospect / free account
  member_status: MemberStatus
  lead_id: string | null
  latest_analyzer_result: AnalyzerResult | null
  analyzed_at: string | null
  acquisition_path: 'self_serve' | 'partner_assisted'
  assigned_partner_affiliate_id: string | null
  assigned_partner_name: string | null
  partner_relationship_started_at: string | null
  partner_onboarding_status: 'unassigned' | 'partner_closing' | 'onboarding' | 'active' | null
  delegate_access_authorized: boolean
  active_business_profile_id?: string | null
  effective_access_scope?: 'free' | 'program_a' | 'program_b' | 'program_c' | 'all_access' | null
  effective_access_source?: 'stripe' | 'demo' | 'manual_override' | 'preview' | 'free' | null
  effective_access_label?: string | null
  effective_allowed_programs?: ProgramId[] | null
  effective_access_override_id?: string | null
  created_at: string
  updated_at: string
  // ── Underwriting ────────────────────────────────────────────────────────────
  underwriting_completed_at: string | null       // last review completion timestamp
  underwriting_next_due_at: string | null        // NULL or past = gate triggers
  underwriting_review_count: number              // total reviews completed
  underwriting_program: string | null
  uw_approval_likelihood: 'high' | 'medium' | 'low' | 'disqualified' | null
  uw_risk_score: number | null
  uw_risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | null
  uw_ai_summary: string | null
  uw_ai_recommendations: string[]
  uw_disqualification_reason: string | null
  uw_key_issues: string[]
  uw_next_accounts: string[]
  uw_estimated_funding_range: string | null
  uw_recommended_issuers: string[]
  // Previous review snapshot (for delta display)
  uw_prev_approval_likelihood: string | null
  uw_prev_risk_score: number | null
  uw_prev_stage: string | null
  // Raw underwriting form answers (stored for roadmap personalization)
  uw_annual_revenue_conf: string | null
  uw_average_daily_balance: string | null
  uw_bank_statement_months: string | null
  uw_outstanding_balances: string | null
  uw_recent_derogatory: boolean
  uw_public_records: boolean
  uw_time_in_business_conf: string | null
  // Program A specific
  uw_card_application_strategy: string | null
  uw_existing_card_balances: string | null
  uw_authorized_user_status: boolean
  // Program B specific
  uw_duns_status: string | null
  uw_ein_open_date: string | null
  uw_vendor_tier_readiness: string | null
}

// ─── Underwriting Review (history record) ─────────────────────────────────────
export interface UnderwritingReview {
  id: string
  user_id: string
  program: string
  review_number: number
  completed_at: string
  approval_likelihood: 'high' | 'medium' | 'low' | 'disqualified'
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  risk_score: number
  determined_stage: string | null
  ai_summary: string | null
  ai_recommendations: string[]
  key_issues: string[]
  next_accounts: string[]
  estimated_funding_range: string | null
  recommended_issuers: string[]
  risk_score_delta: number | null   // positive = improvement
  stage_advanced: boolean
  raw_answers: Record<string, unknown>
  created_at: string
}

// ─── Subscription ─────────────────────────────────────────────────────────────
export type BillingStatus = 'active' | 'inactive' | 'canceled' | 'past_due' | 'past_due_locked' | 'suspended' | 'trialing'
export type FeatureTier = 'free' | 'paid'
// Backwards compatibility aliases
export type SubscriptionStatus = BillingStatus
export type PlanTier = FeatureTier

export interface Subscription {
  id: string
  user_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: BillingStatus
  program: ProgramId | null
  acquisition_path: 'self_serve' | 'partner_assisted'
  assigned_partner_affiliate_id: string | null
  setup_fee_amount_cents: number | null
  recurring_amount_cents: number | null
  current_period_start: string | null
  current_period_end: string | null
  failed_payment_reason?: string | null
  failed_payment_code?: string | null
  failed_payment_decline_code?: string | null
  last_failed_payment_at?: string | null
  next_payment_attempt_at?: string | null
  last_failed_invoice_id?: string | null
  last_failed_payment_intent_id?: string | null
  last_failed_charge_id?: string | null
  payment_retry_count?: number
  final_payment_failure_at?: string | null
  suspended_at?: string | null
  created_at: string
  updated_at: string
}

export interface AccessibleBusiness {
  id: string
  label: string
  program: ProgramId | null
  role: 'owner' | 'admin' | 'member' | 'delegate'
  member_status: MemberStatus
  feature_tier: FeatureTier
  billing_status: BillingStatus
  portal_blocked: boolean
  is_default: boolean
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
  | 'credit_score_report'
  | 'inquiry_summary'
  | 'business_formation'
  | 'ein_letter'
  | 'bank_statement'
  | 'vendor_confirmation'
  | 'vendor_account_screenshot'
  | 'bureau_profile_screenshot'
  | 'other'
  | 'articles_of_organization'
  | 'driver_license'
  | 'utility_bill'
  | 'voided_check'
  | 'business_license'
  | 'duns_confirmation'
  | 'monitoring_report'

export type ReviewStatus = 'pending' | 'reviewed' | 'approved' | 'rejected'

// Program A — credit-specific analysis output
export interface CreditInsights {
  estimated_score_range?: string | null
  utilization_pct?: string | null
  inquiry_count?: number | null
  negative_accounts?: number | null
  recommendations?: string[]
}

// Program B — business identity extracted from documents
export interface BusinessIdentity {
  business_name?: string | null
  ein?: string | null
  entity_type?: string | null
  state?: string | null
  address?: string | null
  duns_number?: string | null
}

export interface AIDocumentAnalysis {
  // ── Shared fields ──
  detected_type: string
  matches_declared_type: boolean
  is_valid: boolean
  confidence: 'high' | 'medium' | 'low'
  validation_summary: string
  rejection_reason: string | null
  extracted_fields: Record<string, string>
  tasks_to_complete: string[]
  next_step_guidance: string
  recommendation: 'approved' | 'needs_review' | 'rejected'
  program_updates_summary?: string | null

  // ── Program A ──
  credit_insights?: CreditInsights | null
  profile_updates?: Record<string, string> | null

  // ── Program B ──
  business_identity?: BusinessIdentity | null
  checklist_completions?: string[] | null
  credit_profile_updates?: Record<string, string> | null

  // ── Program C ──
  monitoring_summary?: string | null
  alerts?: string[] | null
  recommended_actions?: string[] | null
  score_change?: string | null
}

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
  program?: string | null
  ai_analysis_status?: 'pending' | 'analyzing' | 'completed' | 'failed' | 'skipped' | null
  ai_analysis?: AIDocumentAnalysis | null
  ai_analyzed_at?: string | null
  ai_program_updates?: Record<string, unknown> | null
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
  | 'manual_membership_override_granted'
  | 'task_completed'
  | 'document_uploaded'
  | 'report_generated'
  | 'portal_accessed'
  | 'portal_blocked'
  | 'portal_unblocked'
  | 'notification_sent'
  | 'admin_profile_updated'
  | 'signup_requested'
  // ── Underwriting & Roadmap ──
  | 'underwriting_started'
  | 'underwriting_completed'
  | 'underwriting_disqualified'
  | 'roadmap_generated'
  | 'opportunity_viewed'
  | 'application_attempted'
  | 'subscription_started'
  | 'stage_acknowledged'
  | 'admin_granted_access'
  | 'portal_access_granted'
  | 'welcome_agreement_signed'
  | 'tracked_link_click'

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
  credit_source: 'monthly' | 'purchased'
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

// ─── AI Credit Packs ───────────────────────────────────────────────────────────
export interface AICreditPack {
  id: string
  name: string
  description: string | null
  credits_amount: number
  price_usd: number
  stripe_price_id: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface UserPurchasedAICredits {
  id: string
  user_id: string
  credits_purchased: number
  credits_used: number
  credits_remaining: number
  source_type: 'stripe_purchase' | 'admin_grant' | 'admin_deduction' | 'promo'
  source_reference_id: string | null
  purchase_date: string
  expires_at: string | null
  status: 'active' | 'consumed' | 'expired' | 'reversed'
  created_at: string
  updated_at: string
}

export interface AICreditPurchaseTransaction {
  id: string
  user_id: string
  ai_credit_pack_id: string | null
  purchased_credits_bucket_id: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_invoice_id: string | null
  amount_paid: number | null
  credits_added: number
  transaction_status: 'pending' | 'completed' | 'failed' | 'reversed'
  adjusted_by: string | null
  adjustment_reason: string | null
  metadata_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ─── Voice Agent Module ────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type LeadSource = 'purchased' | 'facebook' | 'inbound' | 'other'
export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'skipped'
export type VoiceLineType = 'mobile' | 'landline' | 'voip' | 'unknown'
export type PriorityTier = 1 | 2 | 3
export type CallStatus = 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'busy' | 'canceled'
export type CallDisposition =
  | 'decision_maker' | 'gatekeeper' | 'voicemail' | 'no_answer'
  | 'bad_number' | 'wrong_number' | 'business_closed' | 'personal_line'
  | 'not_interested' | 'do_not_call' | 'send_link' | 'callback_requested'
  | 'interested' | 'transferred_live'

export interface VoiceCampaign {
  id: string
  name: string
  status: CampaignStatus
  description: string | null
  lead_source_filter: string | null
  script_template: string | null
  max_attempts_tier1: number
  max_attempts_tier2: number
  max_attempts_tier3: number
  max_call_duration_seconds: number
  quiet_hours_start: string
  quiet_hours_end: string
  timezone: string
  b2b_mode: boolean
  caller_id: string | null
  transfer_number: string | null
  analyzer_url: string | null
  total_leads: number
  total_calls: number
  total_connects: number
  total_qualified: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface VoiceLead {
  id: string
  campaign_id: string | null
  first_name: string | null
  last_name: string | null
  business_name: string | null
  owner_name: string | null
  email: string | null
  phone_raw: string | null
  phone_e164: string | null
  phone_validated: boolean
  line_type: VoiceLineType
  validation_status: ValidationStatus
  lead_source: LeadSource
  lead_age_days: number | null
  geography: string | null
  duplicate_group_id: string | null
  is_duplicate: boolean
  lead_quality_score: number
  lead_priority_tier: PriorityTier
  last_disposition: CallDisposition | null
  call_attempt_count: number
  last_called_at: string | null
  analyzer_link_sent: boolean
  callback_requested: boolean
  transferred_live: boolean
  do_not_call: boolean
  opted_out_at: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface VoiceCall {
  id: string
  campaign_id: string | null
  lead_id: string | null
  twilio_call_sid: string | null
  status: CallStatus
  direction: string
  from_number: string | null
  to_number: string | null
  duration_seconds: number | null
  disposition: CallDisposition | null
  recording_url: string | null
  transcription: string | null
  summary: string | null
  sentiment_score: number | null
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export interface VoiceCallEvent {
  id: string
  call_id: string
  event_type: string
  event_data: Record<string, unknown> | null
  timestamp: string
}

export interface VoiceDisposition {
  id: CallDisposition
  label: string
  category: 'positive' | 'negative' | 'neutral'
  score_delta: number
  auto_suppress: boolean
  auto_stop: boolean
}

export interface VoiceSuppression {
  id: string
  phone_e164: string
  reason: string
  source: string | null
  added_at: string
  added_by: string | null
}

export interface VoiceFollowup {
  id: string
  lead_id: string
  call_id: string | null
  type: 'sms' | 'email'
  status: 'pending' | 'sent' | 'failed'
  recipient: string | null
  message: string | null
  sent_at: string | null
  error_message: string | null
  created_at: string
}

export interface VoiceAgentSettings {
  id: string
  twilio_account_sid: string | null
  twilio_caller_id: string | null
  transfer_number: string | null
  voice_server_ws_url: string | null
  analyzer_url: string | null
  sms_template: string | null
  email_template: string | null
  email_subject: string | null
  scoring_weights: Record<string, number> | null
  retry_rules: Record<string, unknown> | null
  quiet_hours_start: string
  quiet_hours_end: string
  timezone: string
  recording_disclosure: boolean
  max_concurrent_calls: number
  b2b_mode_only: boolean
  updated_at: string
}

export interface VoicePromptVersion {
  id: string
  name: string
  version: number
  is_active: boolean
  system_prompt: string
  opening_purchased: string | null
  opening_facebook: string | null
  opening_inbound: string | null
  opening_other: string | null
  objection_not_interested: string | null
  objection_busy: string | null
  objection_send_info: string | null
  objection_already_funded: string | null
  objection_working_with_someone: string | null
  objection_what_is_this: string | null
  objection_is_this_loan: string | null
  objection_remove_me: string | null
  created_by: string | null
  created_at: string
}

export interface VoiceLeadScore {
  id: string
  lead_id: string
  score_before: number
  score_after: number
  delta: number
  reason: string | null
  scored_at: string
}

export interface VoiceAnalytics {
  total_campaigns: number
  total_leads: number
  total_calls: number
  total_connects: number
  total_qualified: number
  total_transfers: number
  total_link_sends: number
  total_opt_outs: number
  connect_rate: number
  qualification_rate: number
  best_source: string | null
  worst_source: string | null
  calls_by_disposition: Record<string, number>
  calls_by_source: Record<string, number>
  daily_calls: Array<{ date: string; count: number; connects: number }>
}

// ─── Chatbot ──────────────────────────────────────────────────────────────────
export interface CollectedData {
  full_name?: string
  email?: string
  phone?: string
  business_name?: string
  business_age?: string
  monthly_revenue?: string
  credit_score_range?: string
  funding_goal?: string
  industry?: string
  state?: string
  has_business_credit?: boolean
  has_bank_statements?: boolean
}

export interface QualificationResult {
  readiness_status: 'Ready' | 'Conditionally Ready' | 'Not Ready'
  readiness_score: number
  summary: string
  funding_range?: string
  blockers?: string[]
  recommended_program?: 'A' | 'B' | 'C'
}
