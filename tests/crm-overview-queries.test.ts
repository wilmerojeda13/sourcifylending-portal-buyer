import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCrmLeadsCreatedInRangeFilter,
  applyOpenPipelineLeadFilter,
} from '@/lib/crm-overview-queries'

test('applyCrmLeadsCreatedInRangeFilter constrains created_at to the selected window', () => {
  const calls: Array<[string, string, string?]> = []
  const query = {
    gte(column: string, value: string) {
      calls.push(['gte', column, value])
      return this
    },
    lt(column: string, value: string) {
      calls.push(['lt', column, value])
      return this
    },
    not(column: string, operator: string, value: string) {
      calls.push(['not', column, `${operator}:${value}`])
      return this
    },
  }

  const rangeStart = new Date('2026-04-11T04:00:00.000Z')
  const rangeEnd = new Date('2026-04-12T04:00:00.000Z')
  const result = applyCrmLeadsCreatedInRangeFilter(query, rangeStart, rangeEnd)

  assert.equal(result, query)
  assert.deepEqual(calls, [
    ['gte', 'created_at', '2026-04-11T04:00:00.000Z'],
    ['lt', 'created_at', '2026-04-12T04:00:00.000Z'],
  ])
})

test('applyOpenPipelineLeadFilter excludes closed pipeline stages', () => {
  const calls: Array<[string, string, string]> = []
  const query = {
    gte(column: string, value: string) {
      calls.push(['gte', column, value])
      return this
    },
    lt(column: string, value: string) {
      calls.push(['lt', column, value])
      return this
    },
    not(column: string, operator: string, value: string) {
      calls.push(['not', column, `${operator}:${value}`])
      return this
    },
  }

  const result = applyOpenPipelineLeadFilter(query)

  assert.equal(result, query)
  assert.deepEqual(calls, [
    ['not', 'stage', 'in:("closed_won","closed_lost")'],
  ])
})
