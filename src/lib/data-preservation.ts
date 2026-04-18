/**
 * Data Preservation Utilities
 *
 * Ensures that user work data (tasks, documents, program memberships) is never
 * hard-deleted during tier downgrades. All data transitions use soft-delete patterns.
 */

/**
 * Tables that contain user work data and must NEVER be hard-deleted.
 * These tables use soft-delete patterns (status changes, soft deletes) instead.
 */
const PRESERVATION_PROTECTED_TABLES = [
  'tasks',                    // User tasks - should be marked 'locked' on downgrade, not deleted
  'documents',                // User documents - should be read-only, not deleted
  'program_memberships',      // Program enrollments - should be soft-deleted, not hard-deleted
  'profiles',                 // User profile - core fields never deleted
  'business_profiles',        // Business data - never deleted
  'business_tradelines',      // Credit tradelines - never deleted
  'activity_logs',            // Audit trail - never deleted
]

/**
 * Validates that delete operations on protected tables are using soft-delete patterns.
 * This is a preventive guard to catch any code that might accidentally hard-delete user work.
 *
 * @param table - Table name to validate
 * @param operation - Type of delete operation ('hard' or 'soft')
 * @throws Error if attempting hard delete on a protected table
 */
export function validatePreservationDelete(table: string, operation: 'hard' | 'soft') {
  if (PRESERVATION_PROTECTED_TABLES.includes(table) && operation === 'hard') {
    throw new Error(
      `PRESERVATION ERROR: Hard delete not allowed on table "${table}". ` +
      `User work must be preserved during downgrades. Use soft-delete pattern instead ` +
      `(status updates, soft deletes, or status='locked' for tasks).`
    )
  }
}

/**
 * Documentation of how each user work table is preserved during downgrades:
 *
 * TASKS:
 *   - Status changes to 'locked' when user downgrades (not deleted)
 *   - Queryable and visible in admin for audit purposes
 *   - Can be resumed when user re-upgrades
 *
 * DOCUMENTS:
 *   - Never deleted, just become read-only
 *   - Preserved via portal_blocked flag on profile
 *   - Full download history and analysis preserved
 *
 * PROGRAM_MEMBERSHIPS:
 *   - Soft-deleted via status changes or soft_delete flags
 *   - Re-enrollment triggers upsert, allowing full recovery
 *   - Historical enrollment data preserved in activity_logs
 *
 * PROFILES:
 *   - Core fields never deleted: progress_percentage, current_stage, readiness_status, assigned_program
 *   - Only access is gated via portal_blocked flag and billing_status
 *   - Data remains intact for recovery on re-upgrade
 *
 * BUSINESS_PROFILES & TRADELINES:
 *   - Protected by CASCADE rules in foreign keys
 *   - Credit analysis and reports never deleted
 *   - Business history fully preserved
 *
 * ACTIVITY_LOGS:
 *   - Complete JSONB-based audit trail preserved
 *   - Shows all state transitions including downgrade/upgrade events
 *   - Immutable record of user progress and decisions
 */

/**
 * Downgrade sequence that preserves all user work:
 * 1. Set feature_tier = 'free'
 * 2. Set portal_blocked = true (prevents access without deleting data)
 * 3. Task status automatically managed by application logic (not force-deleted)
 * 4. All other data remains unchanged in database
 * 5. Activity log records the downgrade event
 *
 * Re-upgrade sequence that restores all user work:
 * 1. Stripe webhook triggers on subscription reactivation
 * 2. Set feature_tier = 'paid'
 * 3. Set portal_blocked = false (restores access)
 * 4. Set member_status = 'active_member' if needed
 * 5. All previously locked tasks become accessible again
 * 6. User picks up exactly where they left off
 */

/**
 * Debugging helper: shows what data is preserved for a user
 */
export function debugUserDataPreservation(userId: string) {
  return {
    message: `User ${userId} downgrade/upgrade preserves all work via:`,
    protected_tables: PRESERVATION_PROTECTED_TABLES,
    soft_delete_pattern: {
      access_gating: 'portal_blocked flag on profiles table',
      task_locking: "status = 'locked' in tasks table",
      doc_access: 'read-only via portal_blocked',
      program_recovery: 'upsert on re-enrollment',
    },
    verification: {
      check_task_locks: `SELECT COUNT(*) FROM tasks WHERE user_id = '${userId}' AND status = 'locked'`,
      check_documents: `SELECT COUNT(*) FROM documents WHERE user_id = '${userId}'`,
      check_profile_data: `SELECT progress_percentage, current_stage, assigned_program FROM profiles WHERE id = '${userId}'`,
      check_activity_log: `SELECT created_at, event_type, data FROM activity_logs WHERE user_id = '${userId}' ORDER BY created_at DESC LIMIT 5`,
    }
  }
}
