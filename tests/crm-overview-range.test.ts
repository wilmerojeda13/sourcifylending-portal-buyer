import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCrmAnalyticsTimeZone,
  getThisMonthRangeInCrmTimeZone,
  getThisWeekRangeInCrmTimeZone,
  getTodayRangeInCrmTimeZone,
} from '@/lib/crm-overview-range'

test('today range stays on the same Eastern calendar day after 8 PM local', () => {
  const now = new Date('2026-04-09T02:18:00.000Z')
  const range = getTodayRangeInCrmTimeZone(now)

  assert.equal(getCrmAnalyticsTimeZone(), 'America/New_York')
  assert.equal(range.from.toISOString(), '2026-04-08T04:00:00.000Z')
  assert.equal(range.to.toISOString(), '2026-04-09T04:00:00.000Z')
})

test('week and month ranges use Eastern-local boundaries', () => {
  const now = new Date('2026-04-09T02:18:00.000Z')
  const weekRange = getThisWeekRangeInCrmTimeZone(now)
  const monthRange = getThisMonthRangeInCrmTimeZone(now)

  assert.equal(weekRange.from.toISOString(), '2026-04-06T04:00:00.000Z')
  assert.equal(weekRange.to.toISOString(), '2026-04-13T04:00:00.000Z')
  assert.equal(monthRange.from.toISOString(), '2026-04-01T04:00:00.000Z')
  assert.equal(monthRange.to.toISOString(), '2026-05-01T04:00:00.000Z')
})
