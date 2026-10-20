-- Collapse candidate status groups to Start / Interview / MSP.
-- Display grouping only: does not change application_statuses ids or system keys,
-- and does not update job_applications.status_id.

ALTER TABLE public.application_status_groups
  DROP CONSTRAINT IF EXISTS application_status_groups_system_key_chk;

ALTER TABLE public.application_status_groups
  ADD CONSTRAINT application_status_groups_system_key_chk CHECK (
    system_key IS NULL
    OR system_key IN ('start', 'interview', 'msp', 'client', 'hire', 'closed')
  );

CREATE OR REPLACE FUNCTION public.application_status_default_group_key(
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
    WHEN key = 'new' THEN 'start'
    WHEN key IN ('reviewing', 'shortlisted', 'interviewing') THEN 'interview'
    WHEN key IN ('hired', 'rejected', 'undecided', 'withdrawn', 'archived') THEN 'msp'
    WHEN name IN (
      'new / applied',
      'new / not contacted',
      'new',
      'attempted contact',
      'follow-up needed',
      'follow up needed',
      'unreachable',
      'callback - not available'
    ) THEN 'start'
    WHEN name IN (
      'screening complete',
      'initial screening complete',
      'interview scheduled',
      'interview complete',
      'interviewing',
      'qualified',
      'qualified - ready for interview',
      'qualified-ready for 2nd interview',
      'ai assessed'
    ) OR name LIKE 'qualified%' THEN 'interview'
    WHEN name IN (
      'profile ready',
      'profile uploaded',
      'submitted to msp',
      'submitted for msp review',
      'approved by msp',
      'presented to client',
      'selected by client',
      'selected by msp client',
      'client interview',
      'candidate selected',
      'selected',
      'offer/agreement',
      'offer / agreement',
      'not a fit',
      'disqualified / not a fit',
      'talent pool',
      'fit for future roles',
      'withdraw',
      'candidate withdrew',
      'rejected by msp',
      'rejected by client',
      'rejected after interview',
      'rejected after 2nd interview',
      'rejected at msp screening',
      'position closed',
      'candidate rejected',
      'archived',
      'rejected',
      'undecided',
      'hired'
    )
      OR name LIKE '%submitted to msp%'
      OR name LIKE '%submitted for msp%'
      OR name LIKE 'rejected%'
      OR name LIKE '%not a fit%'
    THEN 'msp'
    ELSE NULL
  END
  FROM norm;
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_application_statuses(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group record;
  v_status record;
  v_has_default boolean;
  v_msp_id uuid;
BEGIN
  FOR v_group IN
    SELECT *
    FROM (
      VALUES
        ('start', 'Start', 'New / Applied, Attempted Contact, Follow-up Needed, Unreachable', 0),
        ('interview', 'Interview', 'Screening Complete, Interview Scheduled, Qualified', 1),
        ('msp', 'MSP', 'Profile Ready, Submitted to MSP, Approved by MSP, Presented to Client, Selected by Client, Selected, Not a Fit, Talent Pool, Withdraw, Rejected by MSP, Rejected by Client', 2)
    ) AS seed(system_key, name, description, sort_order)
  LOOP
    INSERT INTO public.application_status_groups (
      tenant_id, name, description, sort_order, system_key
    )
    SELECT
      p_tenant_id,
      v_group.name,
      v_group.description,
      v_group.sort_order,
      v_group.system_key
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.application_status_groups g
      WHERE g.tenant_id = p_tenant_id
        AND g.system_key = v_group.system_key
    );

    UPDATE public.application_status_groups
    SET
      name = v_group.name,
      description = v_group.description,
      sort_order = v_group.sort_order,
      updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND system_key = v_group.system_key;
  END LOOP;

  SELECT id INTO v_msp_id
  FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id
    AND system_key = 'msp'
  LIMIT 1;

  IF v_msp_id IS NOT NULL THEN
    UPDATE public.application_statuses s
    SET group_id = v_msp_id
    FROM public.application_status_groups g
    WHERE s.tenant_id = p_tenant_id
      AND s.group_id = g.id
      AND g.tenant_id = p_tenant_id
      AND g.system_key IN ('client', 'hire', 'closed');
  END IF;

  DELETE FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id
    AND system_key IN ('client', 'hire', 'closed');

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

  UPDATE public.application_statuses s
  SET group_id = g.id
  FROM public.application_status_groups g
  WHERE s.tenant_id = p_tenant_id
    AND g.tenant_id = p_tenant_id
    AND s.group_id IS NULL
    AND g.system_key = public.application_status_default_group_key(s.name, s.system_key)
    AND public.application_status_default_group_key(s.name, s.system_key) IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_application_statuses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_application_statuses(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_application_statuses(uuid) TO service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_default_application_statuses(t.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
