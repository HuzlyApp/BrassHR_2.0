-- FSD schema aliases + recruiter verification for pre/post-hire workflow steps.
--
-- FSD table names map onto existing BrassHR tables (do not recreate duplicates):
--   workflow_instances            → applicant_workflow_instances
--   workflow_step_instances       → applicant_workflow_step_records
--   applicant_status_catalog      → application_statuses (+ group stage/category)
--   onboarding_workflow_templates → onboarding_flows
--   onboarding_instances          → applicant_workflow_instances
--
-- Recruiter verification for Pre-Hire / Post-Hire steps lives on
-- applicant_workflow_step_records (phase + review_decision/note) with an
-- audit trail in applicant_workflow_step_events.

-- ---------------------------------------------------------------------------
-- 1) Recruiter verification columns on step records (idempotent)
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
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'applicant_workflow_step_records_phase_chk'
      AND conrelid = 'public.applicant_workflow_step_records'::regclass
  ) THEN
    ALTER TABLE public.applicant_workflow_step_records
      ADD CONSTRAINT applicant_workflow_step_records_phase_chk
      CHECK (phase IS NULL OR phase = ANY (ARRAY['pre_hire'::text, 'post_hire'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'applicant_workflow_step_records_review_decision_chk'
      AND conrelid = 'public.applicant_workflow_step_records'::regclass
  ) THEN
    ALTER TABLE public.applicant_workflow_step_records
      ADD CONSTRAINT applicant_workflow_step_records_review_decision_chk
      CHECK (
        review_decision IS NULL
        OR review_decision = ANY (
          ARRAY['complete'::text, 'needs_review'::text, 'reject'::text, 'reopen'::text]
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS applicant_workflow_step_records_phase_idx
  ON public.applicant_workflow_step_records (tenant_id, phase)
  WHERE phase IS NOT NULL;

CREATE INDEX IF NOT EXISTS applicant_workflow_step_records_review_decision_idx
  ON public.applicant_workflow_step_records (tenant_id, review_decision)
  WHERE review_decision IS NOT NULL;

-- Restore staff/self RLS if missing (safe re-create).
ALTER TABLE public.applicant_workflow_step_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applicant_workflow_step_records_staff ON public.applicant_workflow_step_records;
CREATE POLICY applicant_workflow_step_records_staff
  ON public.applicant_workflow_step_records
  FOR ALL TO authenticated
  USING (public.user_is_tenant_staff(tenant_id))
  WITH CHECK (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS applicant_workflow_step_records_self ON public.applicant_workflow_step_records;
CREATE POLICY applicant_workflow_step_records_self
  ON public.applicant_workflow_step_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applicant_workflow_instances wi
      JOIN public.job_applications a ON a.id = wi.application_id
      WHERE wi.id = workflow_instance_id
        AND a.applicant_auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Step verification audit events (Pre-Hire / Post-Hire recruiter actions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applicant_workflow_step_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  workflow_instance_id uuid NOT NULL
    REFERENCES public.applicant_workflow_instances (id) ON DELETE CASCADE,
  step_record_id uuid NOT NULL
    REFERENCES public.applicant_workflow_step_records (id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  actor_name text,
  source text NOT NULL DEFAULT 'admin_hire_journey',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicant_workflow_step_events_action_chk CHECK (
    action = ANY (ARRAY['complete'::text, 'needs_review'::text, 'reject'::text, 'reopen'::text])
  ),
  CONSTRAINT applicant_workflow_step_events_to_status_chk CHECK (
    to_status = ANY (
      ARRAY[
        'pending'::text,
        'in_progress'::text,
        'completed'::text,
        'skipped'::text,
        'failed'::text
      ]
    )
  )
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

ALTER TABLE public.applicant_workflow_step_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applicant_workflow_step_events_staff_select ON public.applicant_workflow_step_events;
CREATE POLICY applicant_workflow_step_events_staff_select
  ON public.applicant_workflow_step_events
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS applicant_workflow_step_events_staff_insert ON public.applicant_workflow_step_events;
CREATE POLICY applicant_workflow_step_events_staff_insert
  ON public.applicant_workflow_step_events
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_staff(tenant_id));

REVOKE ALL ON public.applicant_workflow_step_events FROM anon;
GRANT SELECT, INSERT ON public.applicant_workflow_step_events TO authenticated;
GRANT ALL ON public.applicant_workflow_step_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3) FSD compatibility views (read-only aliases; security invoker keeps RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.workflow_instances
WITH (security_invoker = true) AS
SELECT *
FROM public.applicant_workflow_instances;

CREATE OR REPLACE VIEW public.workflow_step_instances
WITH (security_invoker = true) AS
SELECT *
FROM public.applicant_workflow_step_records;

CREATE OR REPLACE VIEW public.onboarding_instances
WITH (security_invoker = true) AS
SELECT *
FROM public.applicant_workflow_instances;

CREATE OR REPLACE VIEW public.onboarding_workflow_templates
WITH (security_invoker = true) AS
SELECT *
FROM public.onboarding_flows;

-- Stage/category comes from application_status_groups (Start / Interview / MSP).
CREATE OR REPLACE VIEW public.applicant_status_catalog
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.tenant_id,
  s.name,
  s.description,
  s.color,
  s.sort_order,
  s.is_active,
  s.is_default,
  s.system_key,
  s.group_id,
  s.created_by,
  s.created_at,
  s.updated_at,
  g.system_key AS category,
  g.name AS stage,
  g.description AS stage_description,
  g.sort_order AS stage_sort_order
FROM public.application_statuses s
LEFT JOIN public.application_status_groups g ON g.id = s.group_id;

REVOKE ALL ON public.workflow_instances FROM anon, authenticated;
REVOKE ALL ON public.workflow_step_instances FROM anon, authenticated;
REVOKE ALL ON public.onboarding_instances FROM anon, authenticated;
REVOKE ALL ON public.onboarding_workflow_templates FROM anon, authenticated;
REVOKE ALL ON public.applicant_status_catalog FROM anon, authenticated;

GRANT SELECT ON public.workflow_instances TO authenticated, service_role;
GRANT SELECT ON public.workflow_step_instances TO authenticated, service_role;
GRANT SELECT ON public.onboarding_instances TO authenticated, service_role;
GRANT SELECT ON public.onboarding_workflow_templates TO authenticated, service_role;
GRANT SELECT ON public.applicant_status_catalog TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
