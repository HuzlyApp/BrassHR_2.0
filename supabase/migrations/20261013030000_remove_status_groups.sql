-- Status lists are Primary / Alternate / Closing on each stage.
-- Status groups are no longer seeded or assigned. Status rows stay; group_id is cleared.

CREATE OR REPLACE FUNCTION public.ensure_default_application_statuses(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status record;
  v_has_default boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.application_statuses s
    WHERE s.tenant_id = p_tenant_id
      AND s.is_default
  ) INTO v_has_default;

  FOR v_status IN
    SELECT *
    FROM (
      VALUES
        ('new', 'New / Applied', 0, true),
        ('reviewing', 'Screening Complete', 4, false),
        ('shortlisted', 'Qualified', 6, false),
        ('interviewing', 'Interview Scheduled', 5, false),
        ('hired', 'Selected by Client', 11, false),
        ('undecided', 'Talent Pool', 14, false),
        ('withdrawn', 'Withdraw', 15, false),
        ('rejected', 'Not a Fit', 13, false),
        ('archived', 'Position Closed', 18, false)
    ) AS seed(system_key, name, sort_order, wants_default)
  LOOP
    INSERT INTO public.application_statuses (
      tenant_id, name, system_key, sort_order, is_active, is_default
    )
    SELECT
      p_tenant_id,
      v_status.name,
      v_status.system_key,
      v_status.sort_order,
      true,
      v_status.wants_default AND NOT v_has_default
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.application_statuses s
      WHERE s.tenant_id = p_tenant_id
        AND s.system_key = v_status.system_key
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.application_statuses s
      WHERE s.tenant_id = p_tenant_id
        AND lower(btrim(s.name)) = lower(btrim(v_status.name))
    );
  END LOOP;

  FOR v_status IN
    SELECT *
    FROM (
      VALUES
        ('Attempted Contact', 1, NULL::text),
        ('Follow-up Needed', 2, NULL::text),
        ('Unreachable', 3, NULL::text),
        ('Interview Scheduled', 5, NULL::text),
        ('Profile Ready', 7, NULL::text),
        ('Submitted to MSP', 8, 'submitted for msp review'),
        ('Approved by MSP', 9, NULL::text),
        ('Presented to Client', 10, NULL::text),
        ('Selected', 12, NULL::text),
        ('Rejected by MSP', 16, NULL::text),
        ('Rejected by Client', 17, NULL::text)
    ) AS seed(name, sort_order, alias_name)
  LOOP
    INSERT INTO public.application_statuses (
      tenant_id, name, system_key, sort_order, is_active, is_default
    )
    SELECT
      p_tenant_id,
      v_status.name,
      NULL,
      v_status.sort_order,
      true,
      false
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.application_statuses s
      WHERE s.tenant_id = p_tenant_id
        AND lower(btrim(s.name)) IN (
          lower(btrim(v_status.name)),
          lower(btrim(coalesce(v_status.alias_name, v_status.name)))
        )
    )
    AND (
      lower(btrim(v_status.name)) <> 'selected'
      OR NOT EXISTS (
        SELECT 1
        FROM public.application_statuses s
        WHERE s.tenant_id = p_tenant_id
          AND regexp_replace(
            lower(btrim(replace(replace(s.name, chr(8211), '-'), chr(8212), '-'))),
            '\s+',
            ' ',
            'g'
          ) = 'selected'
      )
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_prehire_group_stage_assignments(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_ai_match_group_stage_assignments(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN;
END;
$$;

CREATE TABLE IF NOT EXISTS public.application_status_stage_buttons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.onboarding_flows (id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  show_alternate boolean NOT NULL DEFAULT true,
  show_closed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_stage_buttons_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals',
      'Step 1 · Quick Match',
      'Step 2 · Verifications',
      'Step 3 · Follow-Up',
      'Step 4 · Deep Match',
      'Step 5 · Submission'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_buttons_default_uidx
  ON public.application_status_stage_buttons (tenant_id, stage_name)
  WHERE workflow_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_buttons_workflow_uidx
  ON public.application_status_stage_buttons (tenant_id, workflow_id, stage_name)
  WHERE workflow_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_application_status_stage_buttons_updated_at
  ON public.application_status_stage_buttons;
CREATE TRIGGER set_application_status_stage_buttons_updated_at
BEFORE UPDATE ON public.application_status_stage_buttons
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_stage_buttons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_stage_buttons_staff_select
  ON public.application_status_stage_buttons;
CREATE POLICY application_status_stage_buttons_staff_select
  ON public.application_status_stage_buttons
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_stage_buttons_admin_write
  ON public.application_status_stage_buttons;
CREATE POLICY application_status_stage_buttons_admin_write
  ON public.application_status_stage_buttons
  FOR ALL TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_stage_buttons TO authenticated;
GRANT ALL ON public.application_status_stage_buttons TO service_role;

DELETE FROM public.application_status_groups;

NOTIFY pgrst, 'reload schema';
