import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export async function linkOrphanedAnalyzerResults(
  supabase: ServiceClient,
  userId: string,
  email: string,
): Promise<{ linked: number; error?: string }> {
  try {
    // Find analyzer results by email that haven't been linked to a user yet
    const { data: leads, error: selectError } = await supabase
      .from('leads')
      .select('id')
      .eq('email', email)
      .eq('source', 'free_analyzer')
      .is('converted_to_user_id', null)

    if (selectError) {
      console.error('[Analyzer Link] Failed to find leads:', { email, error: selectError })
      return { linked: 0, error: selectError.message }
    }

    if (!leads || leads.length === 0) {
      return { linked: 0 }
    }

    const leadIds = leads.map((l) => l.id)

    // Link all orphaned analyzer leads to the new user
    const { error: updateError } = await supabase
      .from('leads')
      .update({ converted_to_user_id: userId, updated_at: new Date().toISOString() })
      .in('id', leadIds)

    if (updateError) {
      console.error('[Analyzer Link] Failed to update leads:', { userId, leadIds, error: updateError })
      return { linked: 0, error: updateError.message }
    }

    // Also update profiles to reference the lead
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (!profileError && profile && leadIds.length > 0) {
      // Link to the most recent lead
      await supabase
        .from('profiles')
        .update({
          lead_id: leadIds[leadIds.length - 1],
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
    }

    console.log('[Analyzer Link] Successfully linked analyzer results:', {
      userId,
      email,
      linkedCount: leadIds.length,
    })

    return { linked: leadIds.length }
  } catch (err) {
    console.error('[Analyzer Link] Unexpected error:', { userId, email, err })
    return { linked: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
