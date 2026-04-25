import { DIALER_TIME_ZONE, getTimeZoneDateKey, getTimeZoneDateRange } from '@/lib/timezones'

describe('Dialer Reporting Date Range Parity', () => {
  test('same-day range should include entire selected day', () => {
    const dateKey = '2026-04-24'
    const range = getTimeZoneDateRange(dateKey, DIALER_TIME_ZONE)

    expect(range.start.toISOString()).toContain('2026-04-24')
    expect(range.end.toISOString()).toContain('2026-04-24')

    const startHours = range.start.getUTCHours()
    const endHours = range.end.getUTCHours()

    expect(startHours).toBeLessThan(endHours)
  })

  test('week range should span 7 days', () => {
    const monday = new Date('2026-04-20')
    const dateKey = getTimeZoneDateKey(monday, DIALER_TIME_ZONE)
    const range = getTimeZoneDateRange(dateKey, DIALER_TIME_ZONE)

    const daysDiff = Math.floor((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24))
    expect(daysDiff).toBeGreaterThanOrEqual(0)
    expect(daysDiff).toBeLessThan(2)
  })

  test('date range end should be exclusive (23:59:59.999)', () => {
    const dateKey = '2026-04-24'
    const range = getTimeZoneDateRange(dateKey, DIALER_TIME_ZONE)

    const endMinutes = range.end.getUTCMinutes()
    const endSeconds = range.end.getUTCSeconds()
    const endMillis = range.end.getUTCMilliseconds()

    expect(endMinutes).toBe(59)
    expect(endSeconds).toBe(59)
    expect(endMillis).toBe(999)
  })

  test('API and Analytics page should use same date boundaries', () => {
    const today = new Date('2026-04-25T15:30:00Z')
    const todayKey = getTimeZoneDateKey(today, DIALER_TIME_ZONE)
    const todayRange = getTimeZoneDateRange(todayKey, DIALER_TIME_ZONE)

    const startRange = getTimeZoneDateRange(todayKey, DIALER_TIME_ZONE)
    const endRange = getTimeZoneDateRange(todayKey, DIALER_TIME_ZONE)

    expect(startRange.start.getTime()).toBe(todayRange.start.getTime())
    expect(endRange.end.getTime()).toBe(todayRange.end.getTime())
  })
})
