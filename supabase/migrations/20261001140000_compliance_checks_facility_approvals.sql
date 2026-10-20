-- Compliance checks (OIG, background, drug) and facility approvals, per the applicant pipeline spec.
--
-- Each row belongs to one candidate workflow step (applicant_workflow_step_records) built from the
-- Background Check, Drug Test / Screening, OIG / Exclusion Check or Manager / Facility Approval
-- library nodes. Rows are created when the step record is created and their result follows the
-- step record's status, so every writer (Hire Journey actions, automations) keeps them in sync.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  worker_id uuid REFERENCES public.worker (id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.job_applications (id) ON DELETE SET NULL,
  job_requisition_id uuid REFERENCES public.job_requisitions (id) ON DELETE SET NULL,
  workflow_instance_id uuid NOT NULL REFERENCES public.applicant_workflow_instances (id) ON DELETE CASCADE,
  step_record_id uuid NOT NULL UNIQUE REFERENCES public.applicant_workflow_step_records (id) ON DELETE CASCADE,
  check_type text NOT NULL CHECK (check_type IN ('oig', 'background', 'drug', 'other')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'pending', 'in_progress', 'passed', 'failed', 'not_required', 'waived')),
  vendor_name text,
  external_ref text,
  result_summary text,
  result_payload jsonb,
  notes text,
  ordered_at timestamptz,
  ordered_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  completed_by_name text,
  adverse_action_started boolean NOT NULL DEFAULT false,
  adverse_pre_notice_sent_at timestamptz,
  adverse_final_notice_sent_at timestamptz,
  adverse_wait_days integer DEFAULT 7 CHECK (adverse_wait_days IS NULL OR adverse_wait_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_checks_worker_type_idx
  ON public.compliance_checks (worker_id, check_type);
CREATE INDEX IF NOT EXISTS compliance_checks_tenant_open_idx
  ON public.compliance_checks (tenant_id, status)
  WHERE status IN ('pending', 'in_progress', 'failed');
CREATE INDEX IF NOT EXISTS compliance_checks_instance_idx
  ON public.compliance_checks (workflow_instance_id);
CREATE INDEX IF NOT EXISTS compliance_checks_application_idx
  ON public.compliance_checks (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compliance_checks_requisition_idx
  ON public.compliance_checks (job_requisition_id) WHERE job_requisition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compliance_checks_ordered_by_idx
  ON public.compliance_checks (ordered_by) WHERE ordered_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS compliance_checks_completed_by_idx
  ON public.compliance_checks (completed_by) WHERE completed_by IS NOT NULL;

COMMENT ON TABLE public.compliance_checks IS
  'OIG, background and drug checks per candidate workflow step, with optional adverse-action tracking.';

CREATE TABLE IF NOT EXISTS public.facility_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  worker_id uuid REFERENCES public.worker (id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.job_applications (id) ON DELETE SET NULL,
  job_requisition_id uuid REFERENCES public.job_requisitions (id) ON DELETE SET NULL,
  workflow_instance_id uuid NOT NULL REFERENCES public.applicant_workflow_instances (id) ON DELETE CASCADE,
  step_record_id uuid NOT NULL UNIQUE REFERENCES public.applicant_workflow_step_records (id) ON DELETE CASCADE,
  facility_name text,
  requirement_key text NOT NULL DEFAULT 'facility_approved',
  label text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'not_required')),
  notes text,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  completed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facility_approvals_requisition_worker_idx
  ON public.facility_approvals (job_requisition_id, worker_id);
CREATE INDEX IF NOT EXISTS facility_approvals_worker_idx
  ON public.facility_approvals (worker_id);
CREATE INDEX IF NOT EXISTS facility_approvals_tenant_status_idx
  ON public.facility_approvals (tenant_id, status);
CREATE INDEX IF NOT EXISTS facility_approvals_instance_idx
  ON public.facility_approvals (workflow_instance_id);
CREATE INDEX IF NOT EXISTS facility_approvals_application_idx
  ON public.facility_approvals (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS facility_approvals_completed_by_idx
  ON public.facility_approvals (completed_by) WHERE completed_by IS NOT NULL;

COMMENT ON TABLE public.facility_approvals IS
  'Facility-specific gates (approval received, sworn statement) per candidate workflow step. Can be Not Required.';

DROP TRIGGER IF EXISTS trg_compliance_checks_updated_at ON public.compliance_checks;
CREATE TRIGGER trg_compliance_checks_updated_at
  BEFORE UPDATE ON public.compliance_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_facility_approvals_updated_at ON public.facility_approvals;
CREATE TRIGGER trg_facility_approvals_updated_at
  BEFORE UPDATE ON public.facility_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS: tenant staff can read; writes go through the server (service role) and the sync trigger
-- ---------------------------------------------------------------------------
ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_checks_staff_select ON public.compliance_checks;
CREATE POLICY compliance_checks_staff_select
  ON public.compliance_checks
  FOR SELECT
  USING ((SELECT public.user_is_tenant_staff(tenant_id)));

DROP POLICY IF EXISTS facility_approvals_staff_select ON public.facility_approvals;
CREATE POLICY facility_approvals_staff_select
  ON public.facility_approvals
  FOR SELECT
  USING ((SELECT public.user_is_tenant_staff(tenant_id)));

-- ---------------------------------------------------------------------------
-- 3. Step record → check row mapping
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_check_type_for_step(p_step_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(replace(coalesce(p_step_type, ''), '_', '-'))
    WHEN 'background-check' THEN 'background'
    WHEN 'drug-test-screening' THEN 'drug'
    WHEN 'oig-exclusion-check' THEN 'oig'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_facility_approval_step(p_step_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(replace(coalesce(p_step_type, ''), '_', '-')) = 'manager-facility-approval';
$$;

CREATE OR REPLACE FUNCTION public.compliance_status_for_step_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_status
    WHEN 'completed' THEN 'passed'
    WHEN 'failed' THEN 'failed'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'skipped' THEN 'not_required'
    ELSE 'not_started'
  END;
$$;

CREATE OR REPLACE FUNCTION public.facility_status_for_step_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_status
    WHEN 'completed' THEN 'approved'
    WHEN 'failed' THEN 'rejected'
    WHEN 'skipped' THEN 'not_required'
    ELSE 'pending'
  END;
$$;

-- Creates or refreshes the compliance_checks / facility_approvals row for one step record.
CREATE OR REPLACE FUNCTION public.upsert_step_record_compliance(p_step_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.applicant_workflow_step_records%ROWTYPE;
  v_check_type text;
  v_is_facility boolean;
  v_worker_id uuid;
  v_application_id uuid;
  v_requisition_id uuid;
  v_facility_name text;
  v_decided boolean;
BEGIN
  SELECT * INTO r FROM public.applicant_workflow_step_records WHERE id = p_step_record_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_check_type := public.compliance_check_type_for_step(r.step_type);
  v_is_facility := public.is_facility_approval_step(r.step_type);
  IF v_check_type IS NULL AND NOT v_is_facility THEN
    RETURN;
  END IF;
  v_decided := r.status IN ('completed', 'failed', 'skipped');

  SELECT i.worker_id,
         coalesce(i.application_id, (
           SELECT a.id FROM public.job_applications a
           WHERE a.applicant_workflow_instance_id = i.id
           ORDER BY a.created_at DESC
           LIMIT 1
         )),
         i.job_requisition_id
    INTO v_worker_id, v_application_id, v_requisition_id
  FROM public.applicant_workflow_instances i
  WHERE i.id = r.workflow_instance_id;

  IF v_requisition_id IS NULL AND v_application_id IS NOT NULL THEN
    SELECT a.job_requisition_id INTO v_requisition_id
    FROM public.job_applications a
    WHERE a.id = v_application_id;
  END IF;

  IF v_check_type IS NOT NULL THEN
    INSERT INTO public.compliance_checks AS c (
      tenant_id, worker_id, application_id, job_requisition_id, workflow_instance_id, step_record_id,
      check_type, status, notes, completed_at, completed_by, completed_by_name
    ) VALUES (
      r.tenant_id, v_worker_id, v_application_id, v_requisition_id, r.workflow_instance_id, r.id,
      v_check_type,
      public.compliance_status_for_step_status(r.status),
      r.review_note,
      CASE WHEN v_decided THEN coalesce(r.completed_at, r.status_changed_at) END,
      CASE WHEN v_decided THEN r.status_changed_by END,
      CASE WHEN v_decided THEN r.status_changed_by_name END
    )
    ON CONFLICT (step_record_id) DO UPDATE SET
      worker_id = coalesce(EXCLUDED.worker_id, c.worker_id),
      application_id = coalesce(EXCLUDED.application_id, c.application_id),
      job_requisition_id = coalesce(EXCLUDED.job_requisition_id, c.job_requisition_id),
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      completed_at = EXCLUDED.completed_at,
      completed_by = EXCLUDED.completed_by,
      completed_by_name = EXCLUDED.completed_by_name;
  ELSE
    IF v_requisition_id IS NOT NULL THEN
      SELECT nullif(btrim(jr.facility_name), '') INTO v_facility_name
      FROM public.job_requisitions jr
      WHERE jr.id = v_requisition_id;
    END IF;

    INSERT INTO public.facility_approvals AS f (
      tenant_id, worker_id, application_id, job_requisition_id, workflow_instance_id, step_record_id,
      facility_name, label, status, notes, completed_at, completed_by, completed_by_name
    ) VALUES (
      r.tenant_id, v_worker_id, v_application_id, v_requisition_id, r.workflow_instance_id, r.id,
      v_facility_name, r.title,
      public.facility_status_for_step_status(r.status),
      r.review_note,
      CASE WHEN v_decided THEN coalesce(r.completed_at, r.status_changed_at) END,
      CASE WHEN v_decided THEN r.status_changed_by END,
      CASE WHEN v_decided THEN r.status_changed_by_name END
    )
    ON CONFLICT (step_record_id) DO UPDATE SET
      worker_id = coalesce(EXCLUDED.worker_id, f.worker_id),
      application_id = coalesce(EXCLUDED.application_id, f.application_id),
      job_requisition_id = coalesce(EXCLUDED.job_requisition_id, f.job_requisition_id),
      facility_name = coalesce(f.facility_name, EXCLUDED.facility_name),
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      completed_at = EXCLUDED.completed_at,
      completed_by = EXCLUDED.completed_by,
      completed_by_name = EXCLUDED.completed_by_name;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_step_record_compliance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.compliance_check_type_for_step(NEW.step_type) IS NOT NULL
     OR public.is_facility_approval_step(NEW.step_type) THEN
    PERFORM public.upsert_step_record_compliance(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_step_record_compliance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_step_record_compliance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_step_record_compliance_insert ON public.applicant_workflow_step_records;
CREATE TRIGGER trg_step_record_compliance_insert
  AFTER INSERT ON public.applicant_workflow_step_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_step_record_compliance();

DROP TRIGGER IF EXISTS trg_step_record_compliance_update ON public.applicant_workflow_step_records;
CREATE TRIGGER trg_step_record_compliance_update
  AFTER UPDATE OF status, review_note, status_changed_at ON public.applicant_workflow_step_records
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.review_note IS DISTINCT FROM NEW.review_note
    OR OLD.status_changed_at IS DISTINCT FROM NEW.status_changed_at
  )
  EXECUTE FUNCTION public.sync_step_record_compliance();

-- ---------------------------------------------------------------------------
-- 4. Backfill rows for existing candidate workflow steps
-- ---------------------------------------------------------------------------
SELECT public.upsert_step_record_compliance(r.id)
FROM public.applicant_workflow_step_records r
WHERE public.compliance_check_type_for_step(r.step_type) IS NOT NULL
   OR public.is_facility_approval_step(r.step_type);

