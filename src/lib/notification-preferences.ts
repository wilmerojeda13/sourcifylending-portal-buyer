export type NotificationScope = 'member' | 'admin'

export type MemberNotificationCategory =
  | 'messages'
  | 'documents'
  | 'tasks'
  | 'analyzer'
  | 'billing'
  | 'program'

export type AdminNotificationCategory =
  | 'signups'
  | 'analyzer'
  | 'businesses'
  | 'billing'
  | 'support'
  | 'documents'
  | 'upgrades'

export type NotificationCategory = MemberNotificationCategory | AdminNotificationCategory

export type NotificationPreferenceRecord = {
  desktop_enabled: boolean
  prompt_dismissed_at: string | null
  permission_state: 'default' | 'granted' | 'denied'
  categories: Record<string, boolean>
}

export const MEMBER_NOTIFICATION_CATEGORY_LABELS: Record<MemberNotificationCategory, string> = {
  messages: 'Messages and support replies',
  documents: 'Document review updates',
  tasks: 'Task assignments and completions',
  analyzer: 'Analyzer results and readiness updates',
  billing: 'Billing and subscription issues',
  program: 'Program activations and upgrades',
}

export const ADMIN_NOTIFICATION_CATEGORY_LABELS: Record<AdminNotificationCategory, string> = {
  signups: 'New signups and member creation',
  analyzer: 'Analyzer completions',
  businesses: 'New businesses and unpaid business follow-up',
  billing: 'Payments, subscriptions, and failures',
  support: 'Support inbox activity',
  documents: 'Document uploads and review events',
  upgrades: 'Program upgrades and account changes',
}

export const DEFAULT_MEMBER_NOTIFICATION_CATEGORIES: Record<MemberNotificationCategory, boolean> = {
  messages: true,
  documents: true,
  tasks: true,
  analyzer: true,
  billing: true,
  program: true,
}

export const DEFAULT_ADMIN_NOTIFICATION_CATEGORIES: Record<AdminNotificationCategory, boolean> = {
  signups: true,
  analyzer: true,
  businesses: true,
  billing: true,
  support: true,
  documents: true,
  upgrades: true,
}

export function getDefaultCategories(scope: NotificationScope) {
  return scope === 'admin'
    ? { ...DEFAULT_ADMIN_NOTIFICATION_CATEGORIES }
    : { ...DEFAULT_MEMBER_NOTIFICATION_CATEGORIES }
}

export function normalizePreferenceRecord(
  scope: NotificationScope,
  record?: Partial<NotificationPreferenceRecord> | null,
): NotificationPreferenceRecord {
  return {
    desktop_enabled: Boolean(record?.desktop_enabled),
    prompt_dismissed_at: record?.prompt_dismissed_at ?? null,
    permission_state: record?.permission_state === 'granted' || record?.permission_state === 'denied'
      ? record.permission_state
      : 'default',
    categories: {
      ...getDefaultCategories(scope),
      ...((record?.categories as Record<string, boolean> | null) ?? {}),
    },
  }
}
