-- Pre-Hire stages get status GROUPS (not individual statuses).
-- One group may appear on many stages (one-to-many).
-- Closed stays shared on every stage without requiring per-stage assignment.
-- Replaces the earlier per-status stage assignment approach.

CREATE TABLE IF NOT EXISTS public.application_status_group_stage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  group_id uuid NOT NULL REFERENCES public.application_status_groups (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_group_stage_assignments_stage_chk CHECK (
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

-- Same group may be assigned to many stages; duplicate on one stage is blocked.
CREATE UNIQUE INDEX IF NOT EXISTS application_status_group_stage_assignments_uidx
  ON public.application_status_group_stage_assignments (tenant_id, stage_name, group_id);

CREATE INDEX IF NOT EXISTS application_status_group_stage_assignments_tenant_stage_idx
  ON public.application_status_group_stage_assignments (tenant_id, stage_name, sort_order);

CREATE INDEX IF NOT EXISTS application_status_group_stage_assignments_group_id_idx
  ON public.application_status_group_stage_assignments (group_id);

DROP TRIGGER IF EXISTS set_application_status_group_stage_assignments_updated_at
  ON public.application_status_group_stage_assignments;
CREATE TRIGGER set_application_status_group_stage_assignments_updated_at
BEFORE UPDATE ON public.application_status_group_stage_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_group_stage_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_group_stage_assignments_staff_select
  ON public.application_status_group_stage_assignments;
CREATE POLICY application_status_group_stage_assignments_staff_select
  ON public.application_status_group_stage_assignments
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_group_stage_assignments_admin_insert
  ON public.application_status_group_stage_assignments;
CREATE POLICY application_status_group_stage_assignments_admin_insert
  ON public.application_status_group_stage_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_group_stage_assignments_admin_update
  ON public.application_status_group_stage_assignments;
CREATE POLICY application_status_group_stage_assignments_admin_update
  ON public.application_status_group_stage_assignments
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_group_stage_assignments_admin_delete
  ON public.application_status_group_stage_assignments;
CREATE POLICY application_status_group_stage_assignments_admin_delete
  ON public.application_status_group_stage_assignments
  FOR DELETE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_group_stage_assignments TO authenticated;
GRANT ALL ON public.application_status_group_stage_assignments TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_default_prehire_group_stage_assignments(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start uuid;
  v_interview uuid;
  v_msp uuid;
  v_client uuid;
  v_hire uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.application_status_group_stage_assignments a
    WHERE a.tenant_id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_start FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'start' LIMIT 1;
  SELECT id INTO v_interview FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'interview' LIMIT 1;
  SELECT id INTO v_msp FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'msp' LIMIT 1;
  SELECT id INTO v_client FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'client' LIMIT 1;
  SELECT id INTO v_hire FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'hire' LIMIT 1;

  -- One group → many stages. Closed is not seeded; it is always shared in app logic.
  INSERT INTO public.application_status_group_stage_assignments (
    tenant_id, stage_name, group_id, sort_order
  )
  SELECT p_tenant_id, seed.stage_name, seed.group_id, seed.sort_order
  FROM (
    VALUES
      ('Intake', v_start, 0),
      ('Screening', v_interview, 0),
      ('Interview', v_interview, 0),
      ('Submission', v_msp, 0),
      ('Submission', v_client, 1),
      ('Offer & Agreement', v_hire, 0),
      ('Approvals', v_client, 0),
      ('Approvals', v_hire, 1)
  ) AS seed(stage_name, group_id, sort_order)
  WHERE seed.group_id IS NOT NULL
  ON CONFLICT (tenant_id, stage_name, group_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_prehire_group_stage_assignments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_prehire_group_stage_assignments(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_prehire_group_stage_assignments(uuid) TO service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_default_application_statuses(t.id);
    PERFORM public.ensure_default_prehire_group_stage_assignments(t.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
