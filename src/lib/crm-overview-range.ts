const CRM_ANALYTICS_TIME_ZONE = 'America/New_York'

type ZonedDateParts = {
  year: number
  month: number
  day: number
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')
    ?.value

  const match = timeZoneName?.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    throw new Error(`Unable to resolve timezone offset for ${timeZone}`)
  }

  const [, sign, hours, minutes] = match
  const totalMinutes = Number(hours) * 60 + Number(minutes ?? '0')
  return sign === '+' ? totalMinutes : -totalMinutes
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  }
}

function zonedDateTimeToUtc(parts: ZonedDateParts, timeZone: string, hour = 0, minute = 0, second = 0, millisecond = 0) {
  let utcMillis = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second, millisecond)

  for (let index = 0; index < 3; index += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone)
    utcMillis = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second, millisecond) - offsetMinutes * 60_000
  }

  return new Date(utcMillis)
}

function addDays(parts: ZonedDateParts, days: number): ZonedDateParts {
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  }
}

function getWeekdayNumber(date: Date, timeZone: string) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date)

  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
}

export function getCrmAnalyticsTimeZone() {
  return CRM_ANALYTICS_TIME_ZONE
}

export function getTodayRangeInCrmTimeZone(now: Date, timeZone = CRM_ANALYTICS_TIME_ZONE) {
  const todayParts = getZonedDateParts(now, timeZone)
  const nextDayParts = addDays(todayParts, 1)

  return {
    from: zonedDateTimeToUtc(todayParts, timeZone),
    to: zonedDateTimeToUtc(nextDayParts, timeZone),
  }
}

export function getThisWeekRangeInCrmTimeZone(now: Date, timeZone = CRM_ANALYTICS_TIME_ZONE) {
  const todayParts = getZonedDateParts(now, timeZone)
  const weekday = getWeekdayNumber(now, timeZone)
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  const weekStartParts = addDays(todayParts, mondayOffset)
  const nextWeekParts = addDays(weekStartParts, 7)

  return {
    from: zonedDateTimeToUtc(weekStartParts, timeZone),
    to: zonedDateTimeToUtc(nextWeekParts, timeZone),
  }
}

export function getThisMonthRangeInCrmTimeZone(now: Date, timeZone = CRM_ANALYTICS_TIME_ZONE) {
  const todayParts = getZonedDateParts(now, timeZone)
  const monthStartParts = {
    year: todayParts.year,
    month: todayParts.month,
    day: 1,
  }
  const nextMonthParts = todayParts.month === 12
    ? { year: todayParts.year + 1, month: 1, day: 1 }
    : { year: todayParts.year, month: todayParts.month + 1, day: 1 }

  return {
    from: zonedDateTimeToUtc(monthStartParts, timeZone),
    to: zonedDateTimeToUtc(nextMonthParts, timeZone),
  }
}
