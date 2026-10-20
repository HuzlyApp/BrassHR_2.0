-- Assign application statuses to Pre-Hire workflow stages (Intake…Approvals).
-- Closed statuses are shared across every stage and are not stored as per-stage rows.
-- Does not change application_statuses ids, system keys, or job_applications.status_id.

CREATE TABLE IF NOT EXISTS public.application_status_stage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  status_id uuid NOT NULL REFERENCES public.application_statuses (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_stage_assignments_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_assignments_tenant_status_uidx
  ON public.application_status_stage_assignments (tenant_id, status_id);

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_assignments_tenant_stage_status_uidx
  ON public.application_status_stage_assignments (tenant_id, stage_name, status_id);

CREATE INDEX IF NOT EXISTS application_status_stage_assignments_tenant_stage_sort_idx
  ON public.application_status_stage_assignments (tenant_id, stage_name, sort_order);

CREATE INDEX IF NOT EXISTS application_status_stage_assignments_status_id_idx
  ON public.application_status_stage_assignments (status_id);

DROP TRIGGER IF EXISTS set_application_status_stage_assignments_updated_at
  ON public.application_status_stage_assignments;
CREATE TRIGGER set_application_status_stage_assignments_updated_at
BEFORE UPDATE ON public.application_status_stage_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_stage_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_stage_assignments_staff_select
  ON public.application_status_stage_assignments;
CREATE POLICY application_status_stage_assignments_staff_select
  ON public.application_status_stage_assignments
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_stage_assignments_admin_insert
  ON public.application_status_stage_assignments;
CREATE POLICY application_status_stage_assignments_admin_insert
  ON public.application_status_stage_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_stage_assignments_admin_update
  ON public.application_status_stage_assignments;
CREATE POLICY application_status_stage_assignments_admin_update
  ON public.application_status_stage_assignments
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_stage_assignments_admin_delete
  ON public.application_status_stage_assignments;
CREATE POLICY application_status_stage_assignments_admin_delete
  ON public.application_status_stage_assignments
  FOR DELETE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_stage_assignments TO authenticated;
GRANT ALL ON public.application_status_stage_assignments TO service_role;

-- Suggested Pre-Hire stage for a catalog status (display assignment only).
CREATE OR REPLACE FUNCTION public.application_status_default_prehire_stage(
  p_name text,
  p_system_key text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH norm AS (
    SELECT
      regexp_replace(
        lower(btrim(replace(replace(coalesce(p_name, ''), chr(8211), '-'), chr(8212), '-'))),
        '\s+',
        ' ',
        'g'
      ) AS name,
      lower(btrim(coalesce(p_system_key, ''))) AS key
  )
  SELECT CASE
    -- Closed / terminal dispositions stay shared — no per-stage row.
    WHEN key IN ('rejected', 'undecided', 'withdrawn', 'archived') THEN NULL
    WHEN key = 'new' THEN 'Intake'
    WHEN key = 'reviewing' THEN 'Screening'
    WHEN key IN ('interviewing', 'shortlisted') THEN 'Interview'
    WHEN key = 'hired' THEN 'Approvals'
    WHEN name IN (
      'new / applied', 'new / not contacted', 'new',
      'attempted contact', 'follow-up needed', 'follow up needed',
      'unreachable', 'callback - not available'
    ) THEN 'Intake'
    WHEN name IN (
      'screening complete', 'initial screening complete', 'ai assessed'
    ) THEN 'Screening'
    WHEN name IN (
      'interview scheduled', 'interview complete', 'interviewing',
      'qualified', 'qualified - ready for interview',
      'qualified-ready for 2nd interview'
    ) OR name LIKE 'qualified%' THEN 'Interview'
    WHEN name IN (
      'profile ready', 'profile uploaded',
      'submitted to msp', 'submitted for msp review', 'approved by msp'
    )
      OR name LIKE '%submitted to msp%'
      OR name LIKE '%submitted for msp%'
    THEN 'Submission'
    WHEN name IN (
      'presented to client', 'client interview'
    ) THEN 'Submission'
    WHEN name IN (
      'selected', 'offer/agreement', 'offer / agreement'
    ) THEN 'Offer & Agreement'
    WHEN name IN (
      'selected by client', 'selected by msp client', 'candidate selected', 'hired'
    ) THEN 'Approvals'
    WHEN name IN (
      'not a fit', 'disqualified / not a fit', 'talent pool', 'fit for future roles',
      'withdraw', 'candidate withdrew', 'rejected by msp', 'rejected by client',
      'rejected after interview', 'rejected after 2nd interview',
      'rejected at msp screening', 'position closed', 'candidate rejected',
      'archived', 'rejected', 'undecided'
    )
      OR name LIKE 'rejected%'
      OR name LIKE '%not a fit%'
    THEN NULL
    ELSE NULL
  END
  FROM norm;
$$;

REVOKE ALL ON FUNCTION public.application_status_default_prehire_stage(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.application_status_default_prehire_stage(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.application_status_default_prehire_stage(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.application_status_default_prehire_stage(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_default_prehire_stage_status_assignments(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Seed only when this tenant has no stage assignments yet.
  IF EXISTS (
    SELECT 1
    FROM public.application_status_stage_assignments a
    WHERE a.tenant_id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.application_status_stage_assignments (
    tenant_id, stage_name, status_id, sort_order
  )
  SELECT
    p_tenant_id,
    public.application_status_default_prehire_stage(s.name, s.system_key),
    s.id,
    s.sort_order
  FROM public.application_statuses s
  WHERE s.tenant_id = p_tenant_id
    AND s.is_active
    AND public.application_status_default_prehire_stage(s.name, s.system_key) IS NOT NULL
    -- Skip Closed group members even if name heuristics miss them.
    AND NOT EXISTS (
      SELECT 1
      FROM public.application_status_groups g
      WHERE g.id = s.group_id
        AND g.tenant_id = p_tenant_id
        AND g.system_key = 'closed'
    )
  ON CONFLICT (tenant_id, status_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_prehire_stage_status_assignments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_prehire_stage_status_assignments(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_prehire_stage_status_assignments(uuid) TO service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_default_application_statuses(t.id);
    PERFORM public.ensure_default_prehire_stage_status_assignments(t.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
