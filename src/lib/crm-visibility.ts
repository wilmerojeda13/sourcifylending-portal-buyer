/**
 * Canonical "visible CRM leads" filter.
 * Visible = non-archived, active CRM leads — the same population shown in
 * the Leads list, the Pipeline board, and the Overview dashboard.
 *
 * Apply this to any `crm_leads` query that should be scoped to the active CRM workspace.
 * The generic parameter preserves the Supabase query builder type chain.
 */
export function applyVisibleCrmLeadsFilter(query: any) {
  return query.eq('is_archived', false)
}
