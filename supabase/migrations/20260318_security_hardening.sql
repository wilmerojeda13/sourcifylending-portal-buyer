-- Security hardening: fix overly permissive analyzer_results INSERT policy
-- The old policy allowed any authenticated user to insert a row for ANY user_id.
-- Replaced with a scoped policy that restricts inserts to the authenticated user's own rows.

DROP POLICY IF EXISTS "analyzer_results_insert_any" ON analyzer_results;

CREATE POLICY "analyzer_results_insert_own"
  ON analyzer_results
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
