-- Staff decisions on applicant workflow steps live on the per-candidate step snapshot.
--
-- Recruiter / HR steps (screening, reference verification, interview, internal select, ...)
-- used to keep their status only in worker_onboarding_step_progress, keyed by the tenant's
-- published onboarding step. Re-publishing a workflow creates new tenant steps, so the snapshot
-- re-linked to a fresh "pending" row and the recruiter's decision disappeared. Following the
-- applicant pipeline spec (instance snapshot + per-step completion), the snapshot row in
-- applicant_workflow_step_records is now the source of truth for staff-owned steps, and every
-- decision is written to an append-only history table.

-- ---------------------------------------------------------------------------
-- 1. Decision columns on the step snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.applicant_workflow_step_records
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_changed_by_name text,
  ADD COLUMN IF NOT EXISTS review_decision text,
  ADD COLUMN IF NOT EXISTS review_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'applicant_workflow_step_records_review_decision_chk'
      AND conrelid = 'public.applicant_workflow_step_records'::regclass
  ) THEN
    ALTER TABLE public.applicant_workflow_step_records
      ADD CONSTRAINT applicant_workflow_step_records_review_decision_chk
      CHECK (review_decision IS NULL OR review_decision IN ('complete', 'needs_review', 'reject', 'reopen'));
  END IF;
END $$;

COMMENT ON COLUMN public.applicant_workflow_step_records.status_changed_at IS
  'When staff last changed this step. Newer than the linked progress row = this row wins.';
COMMENT ON COLUMN public.applicant_workflow_step_records.review_decision IS
  'Last staff action: complete | needs_review | reject | reopen.';
COMMENT ON COLUMN public.applicant_workflow_step_records.review_note IS
  'Note entered with the last staff action (required for reject).';

CREATE INDEX IF NOT EXISTS applicant_workflow_step_records_instance_status_idx
  ON public.applicant_workflow_step_records (workflow_instance_id, status);

DROP TRIGGER IF EXISTS trg_applicant_workflow_step_records_updated_at
  ON public.applicant_workflow_step_records;
CREATE TRIGGER trg_applicant_workflow_step_records_updated_at
  BEFORE UPDATE ON public.applicant_workflow_step_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Append-only history of staff actions per step
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applicant_workflow_step_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  workflow_instance_id uuid NOT NULL REFERENCES public.applicant_workflow_instances (id) ON DELETE CASCADE,
  step_record_id uuid NOT NULL REFERENCES public.applicant_workflow_step_records (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('complete', 'needs_review', 'reject', 'reopen')),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed')),
  note text,
  actor_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  actor_name text,
  source text NOT NULL DEFAULT 'admin_hire_journey',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applicant_workflow_step_events_record_idx
  ON public.applicant_workflow_step_events (step_record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applicant_workflow_step_events_tenant_idx
  ON public.applicant_workflow_step_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applicant_workflow_step_events_instance_idx
  ON public.applicant_workflow_step_events (workflow_instance_id);
CREATE INDEX IF NOT EXISTS applicant_workflow_step_events_actor_idx
  ON public.applicant_workflow_step_events (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

COMMENT ON TABLE public.applicant_workflow_step_events IS
  'Audit trail of staff actions (complete / needs review / reject / reopen) on applicant workflow steps.';

ALTER TABLE public.applicant_workflow_step_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applicant_workflow_step_events_staff_select ON public.applicant_workflow_step_events;
CREATE POLICY applicant_workflow_step_events_staff_select
  ON public.applicant_workflow_step_events
  FOR SELECT
  USING ((SELECT public.user_is_tenant_staff(tenant_id)));

-- ---------------------------------------------------------------------------
-- 3. Backfill decisions already stored on progress rows
-- ---------------------------------------------------------------------------
-- For each staff-owned snapshot step, take the most recent staff_review recorded on any
-- progress row of the same candidate whose tenant step has the same library step id.
WITH staff_records AS (
  SELECT r.id, r.tenant_id, r.workflow_instance_id, r.step_type, i.worker_id, i.application_id
  FROM public.applicant_workflow_step_records r
  JOIN public.applicant_workflow_instances i ON i.id = r.workflow_instance_id
  WHERE r.status_changed_at IS NULL
    AND i.worker_id IS NOT NULL
    AND lower(coalesce(r.settings ->> 'completionOwner', '')) NOT IN
      ('', 'applicant', 'contractor', 'worker', 'applicant_or_hr')
),
latest_review AS (
  SELECT DISTINCT ON (sr.id)
    sr.id AS record_id,
    p.status,
    p.completed_at,
    p.data -> 'staff_review' AS review
  FROM staff_records sr
  JOIN public.worker_onboarding_step_progress p
    ON p.worker_id = sr.worker_id
   AND p.tenant_id = sr.tenant_id
   AND p.data ? 'staff_review'
   AND (p.application_id IS NULL OR sr.application_id IS NULL OR p.application_id = sr.application_id)
  JOIN public.tenant_onboarding_steps s
    ON s.id = p.onboarding_step_id
   AND s.metadata ->> 'workflow_step_id' = sr.step_type
  ORDER BY sr.id, (p.data -> 'staff_review' ->> 'reviewed_at') DESC NULLS LAST
)
UPDATE public.applicant_workflow_step_records r
SET status = lr.status,
    completed_at = CASE WHEN lr.status = 'completed' THEN coalesce(lr.completed_at, r.completed_at) ELSE NULL END,
    completed_by = CASE
      WHEN lr.status = 'completed' AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id::text = lr.review ->> 'reviewed_by_user_id'
      ) THEN (lr.review ->> 'reviewed_by_user_id')::uuid
      ELSE NULL
    END,
    status_changed_at = (lr.review ->> 'reviewed_at')::timestamptz,
    status_changed_by = CASE
      WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id::text = lr.review ->> 'reviewed_by_user_id')
        THEN (lr.review ->> 'reviewed_by_user_id')::uuid
      ELSE NULL
    END,
    status_changed_by_name = lr.review ->> 'reviewed_by_name',
    review_decision = CASE
      WHEN lr.review ->> 'decision' IN ('complete', 'needs_review', 'reject', 'reopen') THEN lr.review ->> 'decision'
      ELSE NULL
    END,
    review_note = nullif(btrim(lr.review ->> 'note'), '')
FROM latest_review lr
WHERE r.id = lr.record_id
  AND lr.status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed')
  AND lr.review ->> 'reviewed_at' IS NOT NULL;

-- Seed history for the backfilled decisions.
INSERT INTO public.applicant_workflow_step_events
  (tenant_id, workflow_instance_id, step_record_id, action, to_status, note, actor_user_id, actor_name, source, created_at)
SELECT r.tenant_id, r.workflow_instance_id, r.id, r.review_decision, r.status, r.review_note,
       r.status_changed_by, r.status_changed_by_name, 'backfill', r.status_changed_at
FROM public.applicant_workflow_step_records r
WHERE r.review_decision IS NOT NULL
  AND r.status_changed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.applicant_workflow_step_events e WHERE e.step_record_id = r.id
  );

-- Decisions briefly stored inside settings move to the columns above.
UPDATE public.applicant_workflow_step_records
SET settings = settings - 'staff_review' - 'staff_review_history'
WHERE settings ?| ARRAY['staff_review', 'staff_review_history'];
