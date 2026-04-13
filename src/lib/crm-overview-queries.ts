type CrmLeadCountQuery = {
  gte(column: string, value: string): CrmLeadCountQuery
  lt(column: string, value: string): CrmLeadCountQuery
  not(column: string, operator: string, value: string): CrmLeadCountQuery
}

export function applyCrmLeadsCreatedInRangeFilter<T extends CrmLeadCountQuery>(
  query: T,
  rangeStart: Date,
  rangeEnd: Date,
): T {
  return query
    .gte('created_at', rangeStart.toISOString())
    .lt('created_at', rangeEnd.toISOString()) as T
}

export function applyOpenPipelineLeadFilter<T extends CrmLeadCountQuery>(query: T): T {
  return query.not('stage', 'in', '("closed_won","closed_lost")') as T
}
