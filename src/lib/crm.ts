export const CRM_CALL_OUTCOMES = [
  'No Answer',
  'Voicemail',
  'Left Voicemail',
  'Busy',
  'Bad Number',
  'Not Interested',
  'Do Not Call',
  'Call Back',
  'Call Back Later',
  'Follow Up',
  'Interested',
  'Appointment Set',
  'Booked Call',
  'Demo No Show',
  'Closed Won',
  'Closed Lost',
] as const

export const CRM_LEAD_TEMPERATURES = ['cold', 'warm', 'hot'] as const
export const CRM_CALL_STATUSES = ['completed', 'attempted', 'scheduled', 'missed'] as const
export const CRM_TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
export const CRM_TASK_STATUSES = ['To Do', 'In Progress', 'Waiting', 'Done'] as const
export const CRM_TASK_TYPES = ['Callback', 'Follow-Up', 'Analyzer Follow-Up', 'Send Email', 'Review Docs', 'Book Call', 'Close Deal', 'General'] as const

export type CRMCallOutcome = typeof CRM_CALL_OUTCOMES[number]
export type CRMLeadTemperature = typeof CRM_LEAD_TEMPERATURES[number]
export type CRMCallStatus = typeof CRM_CALL_STATUSES[number]
export type CRMTaskPriority = typeof CRM_TASK_PRIORITIES[number]
export type CRMTaskStatus = typeof CRM_TASK_STATUSES[number]
export type CRMTaskType = typeof CRM_TASK_TYPES[number]

export function outcomeToStage(outcome: CRMCallOutcome): string | null {
  const map: Record<CRMCallOutcome, string | null> = {
    'No Answer': 'Attempting Contact',
    'Voicemail': 'Attempting Contact',
    'Left Voicemail': 'Attempting Contact',
    'Busy': 'Attempting Contact',
    'Bad Number': 'Lost',
    'Not Interested': 'Lost',
    'Do Not Call': 'Lost',
    'Call Back': 'Callback Scheduled',
    'Call Back Later': 'Callback Scheduled',
    'Follow Up': 'Follow-Up Needed',
    'Interested': 'Connected',
    'Appointment Set': 'Strategy Call Booked',
    'Booked Call': 'Strategy Call Booked',
    'Demo No Show': null,
    'Closed Won': 'Won',
    'Closed Lost': 'Lost',
  }
  return map[outcome]
}

export function outcomeToLegacyStage(outcome: CRMCallOutcome): string | null {
  const map: Record<CRMCallOutcome, string | null> = {
    'No Answer': 'contacted',
    'Voicemail': 'contacted',
    'Left Voicemail': 'contacted',
    'Busy': 'contacted',
    'Bad Number': 'closed_lost',
    'Not Interested': 'closed_lost',
    'Do Not Call': 'closed_lost',
    'Call Back': 'callback',
    'Call Back Later': 'callback',
    'Follow Up': 'follow_up',
    'Interested': 'interested',
    'Appointment Set': 'qualified',
    'Booked Call': 'qualified',
    'Demo No Show': null,
    'Closed Won': 'active_client',
    'Closed Lost': 'closed_lost',
  }
  return map[outcome]
}

export function probabilityFromTemperature(temperature: CRMLeadTemperature) {
  if (temperature === 'hot') return 80
  if (temperature === 'warm') return 45
  return 15
}

export function titleCaseTemperature(value: CRMLeadTemperature) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
