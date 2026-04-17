# Work Preservation Test Scenario

## Objective
Verify that user work (tasks, documents, progress) is completely preserved when downgrading from paid to free tier and can be fully resumed upon re-upgrade.

## Test User Setup
1. Create fresh test user: `test-preservation@test.com`
2. Enroll in program_a (paid tier)
3. Set up initial work state:
   - Create 3-5 tasks across different stages
   - Upload 2-3 documents
   - Achieve 30-40% progress on program
   - Complete some subtasks

## Phase 1: Initial State Verification
Before downgrade, verify in admin portal:
- ✓ User has `plan_tier = 'paid'`
- ✓ User has `subscription_status = 'active'`
- ✓ User has `account_state = 'active_member'`
- ✓ User can see all tasks in member detail
- ✓ User can see all documents
- ✓ Progress shows completed work (30-40%)

## Phase 2: Downgrade Scenario
1. Admin goes to member detail page for test user
2. Admin changes `plan_tier` from 'paid' to 'free'
3. Save changes
4. Admin should see banner: "User downgraded to free. All work data preserved: X tasks (locked), Y documents"

## Phase 3: Post-Downgrade Verification
After downgrade, verify in Supabase:
```sql
-- Verify downgrade was applied
SELECT id, plan_tier, subscription_status, portal_blocked, account_state 
FROM profiles WHERE email = 'test-preservation@test.com';

-- Should show: plan_tier='free', portal_blocked=true

-- Verify tasks are still there (but locked)
SELECT task_id, user_id, status, title, created_at
FROM tasks WHERE user_id = (SELECT id FROM profiles WHERE email = 'test-preservation@test.com')
ORDER BY created_at;

-- Should show all tasks with status='locked' or 'pending'

-- Verify documents preserved
SELECT document_id, user_id, file_name, review_status, created_at
FROM documents WHERE user_id = (SELECT id FROM profiles WHERE email = 'test-preservation@test.com')
ORDER BY created_at DESC;

-- Should show all documents intact

-- Verify progress data unchanged
SELECT id, progress_percentage, current_stage, assigned_program
FROM profiles WHERE email = 'test-preservation@test.com';

-- Should show same progress_percentage, current_stage, assigned_program as before

-- Verify activity log records downgrade
SELECT created_at, event_type, data
FROM activity_logs 
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test-preservation@test.com')
AND event_type LIKE '%admin%'
ORDER BY created_at DESC LIMIT 5;

-- Should see downgrade event logged
```

## Phase 4: Re-upgrade Scenario (Admin Downgrade)
1. Admin changes `plan_tier` from 'free' to 'paid' on member detail page
2. Save changes
3. Verify info banner disappears

### Verify Re-upgrade (Admin Method)
```sql
-- Verify upgrade was applied
SELECT id, plan_tier, subscription_status, portal_blocked, account_state 
FROM profiles WHERE email = 'test-preservation@test.com';

-- Should show: plan_tier='paid', portal_blocked=false

-- Verify tasks accessible again
SELECT COUNT(*) as task_count, COUNT(CASE WHEN status='locked' THEN 1 END) as locked_count
FROM tasks WHERE user_id = (SELECT id FROM profiles WHERE email = 'test-preservation@test.com');

-- Should show same task_count as before, locked_count should be 0 or manageable

-- Verify progress still there
SELECT progress_percentage, current_stage, assigned_program
FROM profiles WHERE email = 'test-preservation@test.com';

-- Should show same values as original
```

## Phase 5: Re-upgrade Scenario (Stripe Webhook)
This requires simulating a Stripe subscription reactivation:

1. In Stripe dashboard, find test customer
2. Reactivate or create new subscription
3. Webhook should trigger `customer.subscription.updated`
4. System should detect plan_tier='free' + status='active'
5. System should update: plan_tier='paid', portal_blocked=false, account_state='active_member'

### Verify Webhook Re-upgrade
```sql
-- Verify re-upgrade by webhook
SELECT id, plan_tier, subscription_status, portal_blocked, account_state, updated_at
FROM profiles WHERE email = 'test-preservation@test.com'
ORDER BY updated_at DESC LIMIT 1;

-- Should show: plan_tier='paid', portal_blocked=false, account_state='active_member'
-- AND updated_at should be recent (from webhook)

-- Verify webhook logged in activity
SELECT created_at, event_type, data
FROM activity_logs 
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test-preservation@test.com')
AND event_type = 'subscription_reactivated'
ORDER BY created_at DESC LIMIT 1;

-- Should see subscription_reactivated event
```

## Phase 6: Functional Verification
1. User logs into portal with `test-preservation@test.com`
2. Verify they can see all original tasks
3. Verify they can see all original documents
4. Verify their progress is at same percentage
5. Verify they can resume work on pending tasks
6. Verify program enrollment shows all historical work

## Phase 7: Multiple Downgrade/Upgrade Cycles
Repeat phases 2-5 multiple times to verify:
- No data is lost after repeated cycles
- Portal access properly gates and restores
- Activity log maintains complete audit trail
- Progress data never modified by access gating

## Expected Results
✓ All user work preserved through all downgrade/upgrade cycles
✓ No task data lost
✓ No document data lost
✓ Progress metrics unchanged
✓ Portal access properly restricted during downgrade
✓ Portal access fully restored on upgrade
✓ User can immediately resume work upon upgrade
✓ Activity logs show all transitions

## Debugging
If issues occur:
1. Check `src/lib/data-preservation.ts` for guardrails
2. Review `src/app/api/admin/member/route.ts` downgrade logic
3. Review `src/app/api/stripe/webhook/route.ts` re-upgrade logic
4. Check Supabase RLS policies aren't blocking data access
5. Verify `portal_blocked` flag is being respected by frontend
6. Check activity_logs for event transitions and timing
