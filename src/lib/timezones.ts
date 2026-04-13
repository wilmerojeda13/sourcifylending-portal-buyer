export const DIALER_TIME_ZONE = 'America/New_York'

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

function getParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  type PartType = Intl.DateTimeFormatPart['type']
  const pick = (type: PartType) => {
    const value = parts.find(part => part.type === type)?.value
    return value ? Number(value) : 0
  }

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
    millisecond: date.getMilliseconds(),
  }
}

function zonedTimeToUtc(parts: Omit<DateParts, 'millisecond'> & { millisecond?: number }, timeZone: string) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond ?? 0,
  )

  const guessDate = new Date(utcGuess)
  const guessedParts = getParts(guessDate, timeZone)
  const guessedUtc = Date.UTC(
    guessedParts.year,
    guessedParts.month - 1,
    guessedParts.day,
    guessedParts.hour,
    guessedParts.minute,
    guessedParts.second,
    guessedParts.millisecond,
  )

  return new Date(utcGuess - (guessedUtc - guessDate.getTime()))
}

export function getTimeZoneDateKey(date: Date, timeZone = DIALER_TIME_ZONE) {
  const parts = getParts(date, timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

export function getTimeZoneDateRange(dateKey: string, timeZone = DIALER_TIME_ZONE) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const start = zonedTimeToUtc({ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone)
  const end = zonedTimeToUtc({ year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }, timeZone)
  return { start, end }
}

export function getTimeZoneDayBounds(date = new Date(), timeZone = DIALER_TIME_ZONE) {
  return getTimeZoneDateRange(getTimeZoneDateKey(date, timeZone), timeZone)
}

export function getTimeZoneWeekStart(date = new Date(), timeZone = DIALER_TIME_ZONE) {
  const { year, month, day } = getParts(date, timeZone)
  const localDay = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = localDay.getUTCDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  localDay.setUTCDate(localDay.getUTCDate() - daysFromMonday)
  return zonedTimeToUtc(
    {
      year: localDay.getUTCFullYear(),
      month: localDay.getUTCMonth() + 1,
      day: localDay.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    timeZone,
  )
}

export function getTimeZoneHour(date: Date, timeZone = DIALER_TIME_ZONE) {
  return getParts(date, timeZone).hour
}
