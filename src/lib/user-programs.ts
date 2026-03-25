import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns all active program_codes for the given user from the memberships table.
 * Falls back to [assignedProgram] if the table is unavailable or returns nothing.
 */
export async function getUserPrograms(
  supabase: SupabaseClient,
  userId: string,
  assignedProgram: string | null,
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('memberships')
      .select('program_code')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error || !data || data.length === 0) {
      return assignedProgram ? [assignedProgram] : []
    }

    const codes = data.map((m: { program_code: string }) => m.program_code).filter(Boolean)
    return codes.length > 0 ? codes : assignedProgram ? [assignedProgram] : []
  } catch {
    return assignedProgram ? [assignedProgram] : []
  }
}

/** Human-readable label for a set of programs */
export function getProgramsLabel(programs: string[]): string {
  const map: Record<string, string> = {
    program_a: 'Program A',
    program_b: 'Program B',
    program_c: 'Program C',
  }
  if (programs.length === 0) return 'Client Portal'
  if (programs.length === 1) {
    const labels: Record<string, string> = {
      program_a: '0% Intro APR Cards',
      program_b: 'Business Credit Builder',
      program_c: 'Capital Monitoring',
    }
    return labels[programs[0]] ?? programs[0]
  }
  return programs.map(p => map[p] ?? p).join(' + ')
}
