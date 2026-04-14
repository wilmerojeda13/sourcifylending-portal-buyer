/**
 * Dialer Integrity Gate
 *
 * Tracks lead rejections and generates the import summary.
 */

export interface RejectionEntry {
  leadIdentifier: string  // For logging: "FirstName LastName (Phone)"
  reason: string
  detail: string
}

export interface IntegrityGateSummary {
  totalSubmitted: number
  successCount: number
  rejectionCount: number
  rejections: RejectionEntry[]
  summaryMessage: string
}

/**
 * Generate the final summary message
 */
export function generateSummaryMessage(
  totalSubmitted: number,
  successCount: number,
  rejectionCount: number
): string {
  return `Upload Complete: Out of the ${totalSubmitted} leads uploaded, ${rejectionCount} did not upload because they were identified as bad contacts (invalid phone numbers or missing business/name data). ${successCount} leads were successfully added to the campaign.`
}

/**
 * Create integrity gate summary
 */
export function createIntegrityGateSummary(
  totalSubmitted: number,
  successCount: number,
  rejections: RejectionEntry[]
): IntegrityGateSummary {
  const rejectionCount = rejections.length

  return {
    totalSubmitted,
    successCount,
    rejectionCount,
    rejections,
    summaryMessage: generateSummaryMessage(totalSubmitted, successCount, rejectionCount),
  }
}

/**
 * Add rejection to log
 */
export function addRejection(
  rejections: RejectionEntry[],
  leadIdentifier: string,
  reason: string,
  detail: string
): void {
  rejections.push({
    leadIdentifier,
    reason,
    detail,
  })
}

/**
 * Get rejection counts by reason
 */
export function getRejectionStats(rejections: RejectionEntry[]): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const rejection of rejections) {
    stats[rejection.reason] = (stats[rejection.reason] || 0) + 1
  }
  return stats
}

/**
 * Get sample rejections for logging (up to N per reason)
 */
export function getSampleRejections(rejections: RejectionEntry[], samplesPerReason: number = 2): RejectionEntry[] {
  const byReason: Record<string, RejectionEntry[]> = {}

  for (const rejection of rejections) {
    if (!byReason[rejection.reason]) {
      byReason[rejection.reason] = []
    }
    byReason[rejection.reason].push(rejection)
  }

  const samples: RejectionEntry[] = []
  for (const reason in byReason) {
    samples.push(...byReason[reason].slice(0, samplesPerReason))
  }

  return samples
}
