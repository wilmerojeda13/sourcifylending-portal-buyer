# Dialer Reporting Data Parity Fix

## Problem
The Campaigns page (showing "TODAY" = 88 dials) and Analytics page (showing "TOTAL DIALS" = 34) were returning different numbers for the same date.

## Root Cause
The API endpoint `/api/admin/dialer/analytics/route.ts` used `gte('timestamp', startDate)` **without an upper bound**.

This meant queries for "today" would return:
- April 24 00:00:00 **to NOW** (including April 25, 26, etc.)

While the Analytics page correctly queried:
- April 24 00:00:00 **to April 24 23:59:59.999**

## Solution
Created a shared reporting service (`src/lib/dialer/dialer-reporting-service.ts`) that both:
1. **API endpoint** (`/api/admin/dialer/analytics`)
2. **Analytics page** (via `analytics-data.ts`)

Can use to ensure consistent metric calculation.

### Key Changes
1. **Created** `src/lib/dialer/dialer-reporting-service.ts`
   - Centralized metrics calculation with proper date boundaries
   - Uses `getTimeZoneDateRange()` to ensure both START and END timestamps
   - Consistent outcome definitions (CONNECT_OUTCOMES, INTERESTED_OUTCOMES, etc.)

2. **Updated** `src/app/api/admin/dialer/analytics/route.ts`
   - Now uses the shared reporting service
   - Passes both start AND end dates to ensure bounded queries
   - Removed duplicate query logic

### Date Range Handling
All queries now use the safe pattern:
```typescript
.gte('timestamp', startIso)  // inclusive start
.lte('timestamp', endIso)    // inclusive end (23:59:59.999)
```

This ensures:
- Same-day queries include the full 24-hour period
- Week queries span exactly the selected week
- No overlap between adjacent date ranges

### Outcome Definitions
```typescript
CONNECT_OUTCOMES = ['contacted', 'qualified']
INTERESTED_OUTCOMES = ['interested', 'callback', 'follow_up', 'qualified']
QUALIFIED_OUTCOMES = ['qualified', 'appointment_set', 'booked_call']
PROMOTED_OUTCOMES = ['qualified']
```

## Verification
Run tests to verify date range parity:
```bash
npm test -- dialer-reporting-parity
```

Compare API and Analytics page for same date:
- Analytics: `/admin/dialer/analytics?start=2026-04-24&end=2026-04-24`
- API: `/api/admin/dialer/analytics` (returns today's metrics)
- DialerKpiStrip component: Uses API endpoint for "TODAY" display

All three should now show matching numbers.
