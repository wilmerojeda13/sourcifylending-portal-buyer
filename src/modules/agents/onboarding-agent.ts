import { createServiceClient } from '@/lib/supabase/server'
import { getAccountContext, logAgentAction } from '@/lib/agent-context'
import type { AccountContext } from '@/lib/agent-context'

// ─── Onboarding Agent ─────────────────────────────────────────────────────────
// Runs when: new signup, profile updated, account_state changes
// Responsibilities:
//   - detect missing profile fields
//   - detect if underwriting is needed
//   - detect if roadmap needs generation
//   - log visible guidance for the client

export async function runOnboardingAgent(userId: string): Promise<{ actionsCount: number }> {
  const ctx = await getAccountContext(userId)
  if (!ctx || ctx.isDemo) return { actionsCount: 0 }

  let actionsCount = 0

  // 1. Detect missing required fields
  if (ctx.missingFields.length > 0) {
    const fieldLabels: Record<string, string> = {
      business_name: 'business name',
      entity_type:   'business entity type',
      industry:      'industry',
      phone:         'phone number',
    }
    const labels = ctx.missingFields.map(f => fieldLabels[f] ?? f).join(', ')
    await logAgentAction({
      userId,
      agentName:   'onboarding',
      actionType:  'flag_raised',
      title:       `Your profile is missing: ${labels}`,
      description: 'Complete your profile so the AI can build the most accurate roadmap and opportunity list for your business.',
      status:      'pending_approval',
      needsReview: false,
      visibleToUser: true,
      metadata:    { missing_fields: ctx.missingFields },
    })
    actionsCount++
  }

  // 2. Detect if client has a program but no underwriting yet
  if (
    ctx.assignedProgram &&
    ctx.accountState === 'active_member' &&
    !ctx.hasCompletedUnderwriting
  ) {
    await logAgentAction({
      userId,
      agentName:   'onboarding',
      actionType:  'info',
      title:       'Your credit assessment is ready to begin',
      description: 'Complete your AI-powered credit assessment so we can determine your current stage, eligibility, and build your personalized roadmap.',
      status:      'completed',
      visibleToUser: true,
      metadata:    { program: ctx.assignedProgram },
    })
    actionsCount++
  }

  // 3. Detect if underwriting is done but no roadmap generated yet
  if (ctx.hasCompletedUnderwriting && !ctx.hasGeneratedRoadmap) {
    await logAgentAction({
      userId,
      agentName:   'onboarding',
      actionType:  'info',
      title:       'Your roadmap is ready to generate',
      description: 'Your assessment is complete. Head to your Progress page to generate your personalized action plan.',
      status:      'completed',
      visibleToUser: true,
      metadata:    { program: ctx.assignedProgram },
    })
    actionsCount++
  }

  // 4. Welcome new accounts
  if (ctx.isNewAccount && ctx.accountState === 'active_member' && actionsCount === 0) {
    await logAgentAction({
      userId,
      agentName:   'onboarding',
      actionType:  'info',
      title:       `Welcome to SourcifyLending${ctx.businessName ? `, ${ctx.businessName}` : ''}!`,
      description: `You're enrolled in ${programLabel(ctx.assignedProgram)}. Your AI advisor is ready to guide you through every step. Start by completing your credit assessment.`,
      status:      'completed',
      visibleToUser: true,
      metadata:    { program: ctx.assignedProgram },
    })
    actionsCount++
  }

  return { actionsCount }
}

// ─── Trigger onboarding agent from a profile update ──────────────────────────
export async function triggerOnboardingOnSignup(userId: string) {
  // Fire and forget — don't block the signup flow
  runOnboardingAgent(userId).catch(err =>
    console.error('[OnboardingAgent] Error:', err)
  )
}

// ─── Update profile fields detected from documents/underwriting ──────────────
export async function updateProfileFromAgent(
  userId: string,
  updates: Record<string, unknown>,
  source: string,
) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId)

  if (error) {
    console.error('[OnboardingAgent] Profile update failed:', error.message)
    return false
  }

  const fieldNames = Object.keys(updates).join(', ')
  await logAgentAction({
    userId,
    agentName:   'onboarding',
    actionType:  'profile_updated',
    title:       `Updated your profile: ${fieldNames}`,
    description: `Data extracted from ${source} was used to update your profile automatically.`,
    status:      'completed',
    autoFixed:   true,
    visibleToUser: true,
    metadata:    { updated_fields: Object.keys(updates), source },
  })

  return true
}

function programLabel(program: string | null) {
  if (program === 'program_a') return 'Program A — 0% Intro APR Strategy'
  if (program === 'program_b') return 'Program B — Business Credit Builder'
  if (program === 'program_c') return 'Program C — Capital Monitoring'
  return 'your program'
}
