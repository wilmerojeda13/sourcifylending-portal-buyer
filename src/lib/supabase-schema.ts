type SupabaseLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
}

export function isMissingRelationError(error: SupabaseLikeError | null | undefined, relation?: string) {
  if (!error) return false

  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  const relationName = relation?.toLowerCase()

  return (
    error.code === 'PGRST204' ||
    error.code === '42P01' ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('does not exist') ||
    (relationName ? message.includes(relationName) : false)
  )
}

export function isSchemaDriftError(error: SupabaseLikeError | null | undefined, subject?: string) {
  if (!error) return false

  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  const subjectName = subject?.toLowerCase()

  return (
    isMissingRelationError(error, subject) ||
    error.code === '42703' ||
    message.includes('column') ||
    message.includes('schema cache') ||
    (subjectName ? message.includes(subjectName) : false)
  )
}

export function getRelationUnavailableMessage(subject: string) {
  return `${subject} is not available in this workspace yet. The rest of the CRM can still be used while tracking finishes syncing.`
}
