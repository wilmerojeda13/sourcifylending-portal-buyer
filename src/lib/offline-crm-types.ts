export type OfflineLeadStage =
  | 'new'
  | 'contacted'
  | 'interested'
  | 'callback'
  | 'follow_up'
  | 'qualified'
  | 'demo_held'
  | 'active_client'
  | 'closed_lost'

export type OfflineLeadTemperature = 'cold' | 'warm' | 'hot'
export type OfflineTaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type OfflineTaskStatus = 'To Do' | 'In Progress' | 'Waiting' | 'Done'
export type OfflineTaskType = 'Callback' | 'Follow-Up' | 'Send Email' | 'Review Docs' | 'Book Call' | 'Close Deal' | 'General'
export type OfflineCallOutcome =
  | 'No Answer'
  | 'Left Voicemail'
  | 'Bad Number'
  | 'Not Interested'
  | 'Call Back Later'
  | 'Follow Up'
  | 'Interested'
  | 'Booked Call'
  | 'Demo No Show'
  | 'Closed Won'
  | 'Closed Lost'

export type OfflineCallStatus = 'completed' | 'attempted' | 'scheduled' | 'missed'
export type OfflineSyncState = 'synced' | 'pending' | 'conflict'
export type OfflineMutationEntity = 'lead' | 'task' | 'call'
export type OfflineMutationAction = 'upsert' | 'delete' | 'create'

export interface OfflineBaseRecord {
  id: string
  updated_at: string
  sync_state: OfflineSyncState
  pending_sync: boolean
  local_updated_at: string
  last_synced_at?: string | null
  server_updated_at?: string | null
  conflict_note?: string | null
}

export interface OfflineLead extends OfflineBaseRecord {
  first_name: string
  last_name: string
  phone: string
  email: string | null
  business_name: string | null
  source: string
  stage: OfflineLeadStage
  notes: string | null
  follow_up_at: string | null
  callback_due_at: string | null
  last_contacted_at: string | null
  last_call_at: string | null
  latest_call_note: string | null
  last_call_outcome: string | null
  lead_temperature: OfflineLeadTemperature
  close_probability: number | null
  strategy_call_booked: boolean
  converted_to_client: boolean
  program_interest: 'program_a' | 'program_b' | 'program_c' | null
  do_not_call: boolean
  is_archived: boolean
  tags: string[]
}

export interface OfflineTask extends OfflineBaseRecord {
  lead_id: string | null
  related_call_id: string | null
  title: string
  description: string | null
  task_type: OfflineTaskType
  priority: OfflineTaskPriority
  status: OfflineTaskStatus
  due_at: string | null
  owner_user_id: string | null
  owner_name: string | null
  pipeline_stage: string | null
  notes: string | null
  completed_at: string | null
  client_mutation_id?: string | null
}

export interface OfflineCall extends OfflineBaseRecord {
  lead_id: string
  agent_user_id: string | null
  agent_name: string | null
  lead_name: string
  company_name: string | null
  phone_number: string
  call_started_at: string
  call_ended_at: string | null
  duration_seconds: number | null
  call_status: OfflineCallStatus
  call_outcome: OfflineCallOutcome
  notes: string | null
  next_follow_up_at: string | null
  lead_temperature: OfflineLeadTemperature
  strategy_call_booked: boolean
  converted_to_client: boolean
  source: string | null
  client_mutation_id?: string | null
}

export interface OfflineSyncMutation {
  id: string
  entity: OfflineMutationEntity
  action: OfflineMutationAction
  record_id: string
  base_updated_at: string | null
  local_updated_at: string
  payload: Record<string, unknown>
  attempts: number
  status: 'pending' | 'processing' | 'failed' | 'conflict'
  last_error?: string | null
  created_at: string
  updated_at: string
}

export interface OfflineConflictLog {
  id: string
  entity: OfflineMutationEntity
  record_id: string
  mutation_id: string
  message: string
  resolved_in_favor: 'server' | 'local'
  server_record?: Record<string, unknown> | null
  local_payload?: Record<string, unknown> | null
  created_at: string
}

export interface OfflineSnapshotMeta {
  device_id: string
  last_bootstrap_at?: string | null
  last_sync_at?: string | null
  last_sync_error?: string | null
  force_offline?: boolean
  local_auth_hash?: string | null
  local_auth_enabled?: boolean
  admin_user_id?: string | null
  admin_name?: string | null
  installed?: boolean
}

export interface OfflineBootstrapResponse {
  leads: OfflineLead[]
  tasks: OfflineTask[]
  calls: OfflineCall[]
  user: {
    id: string
    name: string
    email?: string | null
  }
  generated_at: string
}

export interface OfflineSyncResponseItem {
  mutation_id: string
  entity: OfflineMutationEntity
  local_id: string
  status: 'synced' | 'conflict' | 'failed'
  server_id?: string | null
  record?: Record<string, unknown> | null
  message?: string | null
  resolved_in_favor?: 'server' | 'local' | null
  server_record?: Record<string, unknown> | null
}
