-- Named groups for candidate/application statuses.
-- Existing application_statuses rows keep their ids, names, and system keys.
-- job_applications.status_id is not updated.

-- ---------------------------------------------------------------------------
-- 1) Groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_status_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  system_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_groups_name_nonempty_chk CHECK (length(btrim(name)) > 0),
  CONSTRAINT application_status_groups_description_len_chk CHECK (
    description IS NULL OR length(description) <= 2000
  ),
  CONSTRAINT application_status_groups_system_key_chk CHECK (
    system_key IS NULL
    OR system_key IN ('start', 'interview', 'msp', 'client', 'hire', 'closed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS application_status_groups_tenant_name_uidx
  ON public.application_status_groups (tenant_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS application_status_groups_tenant_system_key_uidx
  ON public.application_status_groups (tenant_id, system_key)
  WHERE system_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS application_status_groups_tenant_sort_idx
  ON public.application_status_groups (tenant_id, sort_order, name);

DROP TRIGGER IF EXISTS set_application_status_groups_updated_at ON public.application_status_groups;
CREATE TRIGGER set_application_status_groups_updated_at
BEFORE UPDATE ON public.application_status_groups
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_groups_staff_select ON public.application_status_groups;
CREATE POLICY application_status_groups_staff_select
  ON public.application_status_groups
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_groups_admin_insert ON public.application_status_groups;
CREATE POLICY application_status_groups_admin_insert
  ON public.application_status_groups
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_groups_admin_update ON public.application_status_groups;
CREATE POLICY application_status_groups_admin_update
  ON public.application_status_groups
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_groups_admin_delete ON public.application_status_groups;
CREATE POLICY application_status_groups_admin_delete
  ON public.application_status_groups
  FOR DELETE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_groups TO authenticated;
GRANT ALL ON public.application_status_groups TO service_role;

ALTER TABLE public.application_statuses
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.application_status_groups (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS application_statuses_group_id_idx
  ON public.application_statuses (group_id);

CREATE INDEX IF NOT EXISTS application_statuses_tenant_group_sort_idx
  ON public.application_statuses (tenant_id, group_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2) Group suggestion. Must stay aligned with defaultStatusGroupKey().
-- ---------------------------------------------------------------------------
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
    WHEN key = 'hired' THEN 'client'
    WHEN key IN ('rejected', 'undecided', 'withdrawn', 'archived') THEN 'closed'
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
      'approved by msp'
    )
      OR name LIKE '%submitted to msp%'
      OR name LIKE '%submitted for msp%'
    THEN 'msp'
    WHEN name IN (
      'presented to client',
      'selected by client',
      'selected by msp client',
      'client interview',
      'candidate selected'
    ) THEN 'client'
    WHEN name IN ('selected', 'offer/agreement', 'offer / agreement') THEN 'hire'
    WHEN name IN (
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
      'undecided'
    )
      OR name LIKE 'rejected%'
      OR name LIKE '%not a fit%'
    THEN 'closed'
    ELSE NULL
  END
  FROM norm;
$$;

REVOKE ALL ON FUNCTION public.application_status_default_group_key(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.application_status_default_group_key(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.application_status_default_group_key(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.application_status_default_group_key(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Seed groups and fill only missing status slots. Never rename or retarget.
-- ---------------------------------------------------------------------------
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
BEGIN
  FOR v_group IN
    SELECT *
    FROM (
      VALUES
        ('start', 'Start', 'New applicants and early outreach, including follow-ups and people who could not be reached.', 0),
        ('interview', 'Interview', 'Screening and interview progress, from a completed screen through a scheduled or finished interview.', 1),
        ('msp', 'MSP', 'Profiles prepared for an MSP, submitted for review, or decided by the MSP.', 2),
        ('client', 'Client', 'Candidates presented to the client or selected by the client.', 3),
        ('hire', 'Hire', 'Candidates selected to hire. Placement acceptance stays on the client status that uses the hired workflow.', 4),
        ('closed', 'Closed', 'Outcomes that leave the active pipeline, including not a fit, talent pool, withdrawals, and rejections.', 5)
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
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.application_statuses s
    WHERE s.tenant_id = p_tenant_id
      AND s.is_default
  ) INTO v_has_default;

  -- System-key rows are created only when that key is missing.
  -- Display names stay on the existing row when the key is already present.
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

  -- Name-only slots. Skip when an existing status already fills the slot
  -- so we do not split candidates across a duplicate label.
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
