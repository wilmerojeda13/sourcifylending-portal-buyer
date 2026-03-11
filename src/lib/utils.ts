import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getProgramLabel(programId: string | null): string {
  const labels: Record<string, string> = {
    program_a: 'Program A — 0% Intro APR Card Strategy',
    program_b: 'Program B — Business Credit Builder',
    program_c: 'Program C — Capital Monitoring Membership',
  }
  return programId ? labels[programId] || programId : 'Not Assigned'
}

export function getProgramShortLabel(programId: string | null): string {
  const labels: Record<string, string> = {
    program_a: '0% Intro APR Cards',
    program_b: 'Business Credit Builder',
    program_c: 'Capital Monitoring',
  }
  return programId ? labels[programId] || programId : 'Not Assigned'
}

export function getReadinessColor(status: string | null): string {
  if (status === 'Ready') return 'text-green-600 bg-green-50 border-green-200'
  if (status === 'Conditionally Ready') return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-green-700 bg-green-100'
    case 'pending': return 'text-blue-700 bg-blue-100'
    case 'locked': return 'text-gray-500 bg-gray-100'
    case 'overdue': return 'text-red-700 bg-red-100'
    case 'active': return 'text-green-700 bg-green-100'
    case 'inactive':
    case 'canceled': return 'text-red-700 bg-red-100'
    case 'past_due': return 'text-orange-700 bg-orange-100'
    default: return 'text-gray-600 bg-gray-100'
  }
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.substring(0, length) + '...' : str
}
