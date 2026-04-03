import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { OfflineSyncMutation, OfflineSyncResponseItem } from '@/lib/offline-crm-types'

async function assertAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const supabase = await createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return {
    supabase,
    userId: user.id,
    userName: profile.full_name || profile.email || 'Admin',
  }
}

function asIsoDate(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function resolveConflict(currentUpdatedAt: string | null, baseUpdatedAt: string | null, localUpdatedAt: string) {
  if (!currentUpdatedAt || !baseUpdatedAt) return { mode: 'apply' as const }
  const currentTime = new Date(currentUpdatedAt).getTime()
  const baseTime = new Date(baseUpdatedAt).getTime()
  const localTime = new Date(localUpdatedAt).getTime()

  if (currentTime <= baseTime) return { mode: 'apply' as const }
  if (localTime > currentTime) return { mode: 'apply_with_conflict_log' as const }
  return { mode: 'server_wins' as const }
}

async function logConflict(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: {
    entity_type: string
    entity_id: string
    device_id: string | null
    mutation_id: string
    conflict_type: string
    local_payload: Record<string, unknown>
    server_payload: Record<string, unknown> | null
    resolved_in_favor: 'server' | 'local'
  },
) {
  await supabase.from('crm_sync_conflicts').insert(payload)
}

export async function POST(req: NextRequest) {
  const admin = await assertAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const deviceId = typeof body.device_id === 'string' ? body.device_id : null
  const mutations = Array.isArray(body.mutations) ? body.mutations as OfflineSyncMutation[] : []
  const results: OfflineSyncResponseItem[] = []

  for (const mutation of mutations) {
    try {
      if (mutation.entity === 'lead') {
        const currentResult = await admin.supabase.from('crm_leads').select('*').eq('id', mutation.record_id).single()
        if (currentResult.error || !currentResult.data) {
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            status: 'failed',
            message: currentResult.error?.message ?? 'Lead not found.',
          })
          continue
        }

        const resolution = resolveConflict(currentResult.data.updated_at ?? null, mutation.base_updated_at, mutation.local_updated_at)
        if (resolution.mode === 'server_wins') {
          await logConflict(admin.supabase, {
            entity_type: 'lead',
            entity_id: mutation.record_id,
            device_id: deviceId,
            mutation_id: mutation.id,
            conflict_type: 'stale_update',
            local_payload: mutation.payload,
            server_payload: currentResult.data,
            resolved_in_favor: 'server',
          })
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            status: 'conflict',
            message: 'A newer lead update already exists on the server.',
            resolved_in_favor: 'server',
            server_record: currentResult.data,
          })
          continue
        }

        const updatePayload = {
          ...mutation.payload,
          updated_at: mutation.local_updated_at,
        }
        const updateResult = await admin.supabase
          .from('crm_leads')
          .update(updatePayload)
          .eq('id', mutation.record_id)
          .select('*')
          .single()

        if (updateResult.error || !updateResult.data) {
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            status: 'failed',
            message: updateResult.error?.message ?? 'Unable to sync lead.',
          })
          continue
        }

        if (resolution.mode === 'apply_with_conflict_log') {
          await logConflict(admin.supabase, {
            entity_type: 'lead',
            entity_id: mutation.record_id,
            device_id: deviceId,
            mutation_id: mutation.id,
            conflict_type: 'local_newer_applied',
            local_payload: mutation.payload,
            server_payload: currentResult.data,
            resolved_in_favor: 'local',
          })
        }

        results.push({
          mutation_id: mutation.id,
          entity: mutation.entity,
          local_id: mutation.record_id,
          status: 'synced',
          record: updateResult.data,
          resolved_in_favor: resolution.mode === 'apply_with_conflict_log' ? 'local' : null,
        })
        continue
      }

      if (mutation.entity === 'task') {
        const payload = mutation.payload
        const clientMutationId = typeof payload.client_mutation_id === 'string' ? payload.client_mutation_id : mutation.id
        const isLocalCreate = String(payload.id ?? '').startsWith('local-')

        if (mutation.action === 'create' || isLocalCreate) {
          const existingTask = await admin.supabase
            .from('crm_tasks')
            .select('*')
            .eq('client_mutation_id', clientMutationId)
            .maybeSingle()

          if (existingTask.data) {
            results.push({
              mutation_id: mutation.id,
              entity: mutation.entity,
              local_id: mutation.record_id,
              server_id: existingTask.data.id,
              status: 'synced',
              record: existingTask.data,
            })
            continue
          }

          const insertPayload = {
            lead_id: payload.lead_id || null,
            related_call_id: payload.related_call_id || null,
            title: payload.title,
            description: payload.description || null,
            task_type: payload.task_type || 'General',
            priority: payload.priority || 'Medium',
            status: payload.status || 'To Do',
            due_at: payload.due_at || null,
            owner_user_id: payload.owner_user_id || admin.userId,
            owner_name: payload.owner_name || admin.userName,
            pipeline_stage: payload.pipeline_stage || null,
            notes: payload.notes || null,
            completed_at: payload.status === 'Done' ? asIsoDate(payload.completed_at) || mutation.local_updated_at : null,
            created_by_user_id: admin.userId,
            updated_at: mutation.local_updated_at,
            client_mutation_id: clientMutationId,
          }

          const insertResult = await admin.supabase.from('crm_tasks').insert(insertPayload).select('*').single()
          if (insertResult.error || !insertResult.data) {
            results.push({
              mutation_id: mutation.id,
              entity: mutation.entity,
              local_id: mutation.record_id,
              status: 'failed',
              message: insertResult.error?.message ?? 'Unable to create task.',
            })
            continue
          }

          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            server_id: insertResult.data.id,
            status: 'synced',
            record: insertResult.data,
          })
          continue
        }

        const currentTask = await admin.supabase.from('crm_tasks').select('*').eq('id', mutation.record_id).single()
        if (currentTask.error || !currentTask.data) {
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            status: 'failed',
            message: currentTask.error?.message ?? 'Task not found.',
          })
          continue
        }

        const resolution = resolveConflict(currentTask.data.updated_at ?? null, mutation.base_updated_at, mutation.local_updated_at)
        if (resolution.mode === 'server_wins') {
          await logConflict(admin.supabase, {
            entity_type: 'task',
            entity_id: mutation.record_id,
            device_id: deviceId,
            mutation_id: mutation.id,
            conflict_type: 'stale_update',
            local_payload: mutation.payload,
            server_payload: currentTask.data,
            resolved_in_favor: 'server',
          })
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            status: 'conflict',
            message: 'A newer task update already exists on the server.',
            resolved_in_favor: 'server',
            server_record: currentTask.data,
          })
          continue
        }

        const updateResult = await admin.supabase
          .from('crm_tasks')
          .update({
            ...mutation.payload,
            updated_at: mutation.local_updated_at,
          })
          .eq('id', mutation.record_id)
          .select('*')
          .single()

        if (updateResult.error || !updateResult.data) {
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            status: 'failed',
            message: updateResult.error?.message ?? 'Unable to sync task.',
          })
          continue
        }

        if (resolution.mode === 'apply_with_conflict_log') {
          await logConflict(admin.supabase, {
            entity_type: 'task',
            entity_id: mutation.record_id,
            device_id: deviceId,
            mutation_id: mutation.id,
            conflict_type: 'local_newer_applied',
            local_payload: mutation.payload,
            server_payload: currentTask.data,
            resolved_in_favor: 'local',
          })
        }

        results.push({
          mutation_id: mutation.id,
          entity: mutation.entity,
          local_id: mutation.record_id,
          status: 'synced',
          record: updateResult.data,
          resolved_in_favor: resolution.mode === 'apply_with_conflict_log' ? 'local' : null,
        })
        continue
      }

      if (mutation.entity === 'call') {
        const payload = mutation.payload
        const clientMutationId = typeof payload.client_mutation_id === 'string' ? payload.client_mutation_id : mutation.id
        const existingCall = await admin.supabase
          .from('crm_calls')
          .select('*')
          .eq('client_mutation_id', clientMutationId)
          .maybeSingle()

        if (existingCall.data) {
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            server_id: existingCall.data.id,
            status: 'synced',
            record: existingCall.data,
          })
          continue
        }

        const insertResult = await admin.supabase
          .from('crm_calls')
          .insert({
            lead_id: payload.lead_id,
            agent_user_id: admin.userId,
            agent_name: payload.agent_name || admin.userName,
            lead_name: payload.lead_name,
            company_name: payload.company_name || null,
            phone_number: payload.phone_number,
            call_started_at: payload.call_started_at || mutation.local_updated_at,
            call_ended_at: payload.call_ended_at || null,
            duration_seconds: payload.duration_seconds || null,
            call_status: payload.call_status || 'completed',
            call_outcome: payload.call_outcome || 'Follow Up',
            notes: payload.notes || null,
            next_follow_up_at: payload.next_follow_up_at || null,
            lead_temperature: payload.lead_temperature || 'cold',
            strategy_call_booked: Boolean(payload.strategy_call_booked),
            converted_to_client: Boolean(payload.converted_to_client),
            source: payload.source || null,
            updated_at: mutation.local_updated_at,
            client_mutation_id: clientMutationId,
          })
          .select('*')
          .single()

        if (insertResult.error || !insertResult.data) {
          results.push({
            mutation_id: mutation.id,
            entity: mutation.entity,
            local_id: mutation.record_id,
            status: 'failed',
            message: insertResult.error?.message ?? 'Unable to create call log.',
          })
          continue
        }

        results.push({
          mutation_id: mutation.id,
          entity: mutation.entity,
          local_id: mutation.record_id,
          server_id: insertResult.data.id,
          status: 'synced',
          record: insertResult.data,
        })
      }
    } catch (error) {
      results.push({
        mutation_id: mutation.id,
        entity: mutation.entity,
        local_id: mutation.record_id,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Sync failed.',
      })
    }
  }

  return NextResponse.json({ results })
}
