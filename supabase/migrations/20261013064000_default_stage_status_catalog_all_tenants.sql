-- The Pre-Hire and AI stage lists are the tenant default.
-- A tenant that already has stage lanes is left unchanged.

CREATE OR REPLACE FUNCTION public.ensure_default_stage_status_catalog(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_status uuid;
  v_sort integer;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.application_status_stage_lanes
    WHERE tenant_id = p_tenant_id
      AND workflow_id IS NULL
  ) THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('New/ Applied'),
        ('Resume Verified'),
        ('Documents Verified'),
        ('Application Closed'),
        ('Attempted Contact'),
        ('Screening Complete'),
        ('Follow-up Needed'),
        ('Interview Scheduled'),
        ('Qualified'),
        ('Submitted to MSP'),
        ('MSP Approved'),
        ('Submitted to Client'),
        ('Client Approved'),
        ('Verification Complete'),
        ('Offer Accepted')
    ) AS seed(name)
  LOOP
    SELECT s.id
    INTO v_status
    FROM public.application_statuses s
    WHERE s.tenant_id = p_tenant_id
      AND regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g')
        = regexp_replace(lower(btrim(rec.name)), '[^a-z0-9]+', '', 'g')
    ORDER BY s.is_active DESC, s.created_at
    LIMIT 1;

    IF v_status IS NULL THEN
      SELECT COALESCE(MAX(sort_order), -1) + 1
      INTO v_sort
      FROM public.application_statuses
      WHERE tenant_id = p_tenant_id;

      INSERT INTO public.application_statuses (
        tenant_id, name, sort_order, is_active, is_default
      )
      VALUES (p_tenant_id, rec.name, v_sort, true, false);
    END IF;
  END LOOP;

  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('Intake', 'New/ Applied', 'happy_path', 0),
        ('Intake', 'Resume Verified', 'happy_path', 1),
        ('Intake', 'Documents Verified', 'happy_path', 2),
        ('Intake', 'Application Closed', 'closed', 0),
        ('Screening', 'Attempted Contact', 'happy_path', 0),
        ('Screening', 'Screening Complete', 'happy_path', 1),
        ('Screening', 'Follow-up Needed', 'alternate', 0),
        ('Screening', 'Application Closed', 'closed', 0),
        ('Interview', 'Interview Scheduled', 'happy_path', 0),
        ('Interview', 'Qualified', 'happy_path', 1),
        ('Interview', 'Follow-up Needed', 'alternate', 0),
        ('Interview', 'Application Closed', 'closed', 0),
        ('Submission', 'Submitted to MSP', 'happy_path', 0),
        ('Submission', 'MSP Approved', 'happy_path', 1),
        ('Submission', 'Submitted to Client', 'happy_path', 2),
        ('Submission', 'Client Approved', 'happy_path', 3),
        ('Submission', 'Follow-up Needed', 'alternate', 0),
        ('Submission', 'Application Closed', 'closed', 0),
        ('Compliance', 'Verification Complete', 'happy_path', 0),
        ('Compliance', 'Follow-up Needed', 'alternate', 0),
        ('Compliance', 'Application Closed', 'closed', 0),
        ('Offer & Agreement', 'Offer Accepted', 'happy_path', 0),
        ('Offer & Agreement', 'Follow-up Needed', 'alternate', 0),
        ('Offer & Agreement', 'Application Closed', 'closed', 0),
        ('Step 1 · Quick Match', 'New/ Applied', 'happy_path', 0),
        ('Step 1 · Quick Match', 'Resume Verified', 'happy_path', 1),
        ('Step 1 · Quick Match', 'Documents Verified', 'happy_path', 2),
        ('Step 1 · Quick Match', 'Application Closed', 'closed', 0),
        ('Step 2 · Verifications', 'Attempted Contact', 'happy_path', 0),
        ('Step 2 · Verifications', 'Screening Complete', 'happy_path', 1),
        ('Step 2 · Verifications', 'Follow-up Needed', 'alternate', 0),
        ('Step 2 · Verifications', 'Application Closed', 'closed', 0),
        ('Step 3 · Follow-Up', 'Follow-up Needed', 'alternate', 0),
        ('Step 3 · Follow-Up', 'Application Closed', 'closed', 0),
        ('Step 4 · Deep Match', 'Qualified', 'happy_path', 0),
        ('Step 4 · Deep Match', 'Application Closed', 'closed', 0),
        ('Step 5 · Submission', 'Submitted to MSP', 'happy_path', 0),
        ('Step 5 · Submission', 'MSP Approved', 'happy_path', 1),
        ('Step 5 · Submission', 'Submitted to Client', 'happy_path', 2),
        ('Step 5 · Submission', 'Client Approved', 'happy_path', 3),
        ('Step 5 · Submission', 'Follow-up Needed', 'alternate', 0),
        ('Step 5 · Submission', 'Application Closed', 'closed', 0)
    ) AS lane_seed(stage_name, status_name, lane, sort_order)
  LOOP
    SELECT s.id
    INTO v_status
    FROM public.application_statuses s
    WHERE s.tenant_id = p_tenant_id
      AND regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g')
        = regexp_replace(lower(btrim(rec.status_name)), '[^a-z0-9]+', '', 'g')
    ORDER BY s.is_active DESC, s.created_at
    LIMIT 1;

    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Missing status % for stage catalog', rec.status_name;
    END IF;

    INSERT INTO public.application_status_stage_lanes (
      tenant_id, stage_name, status_id, lane, sort_order, workflow_id
    )
    VALUES (p_tenant_id, rec.stage_name, v_status, rec.lane, rec.sort_order, NULL)
    ON CONFLICT (tenant_id, stage_name, status_id) WHERE workflow_id IS NULL
    DO UPDATE SET
      lane = EXCLUDED.lane,
      sort_order = EXCLUDED.sort_order;
  END LOOP;

  INSERT INTO public.application_status_stage_reason_codes (
    tenant_id, stage_name, code, sort_order, workflow_id, note
  )
  SELECT p_tenant_id, seed.stage_name, seed.code, seed.sort_order, NULL, seed.note
  FROM (
    VALUES
      ('Intake', 'Not a Fit', 0, 'This stage is before the candidate is contacted, only based on the resume and documents submitted.'),
      ('Screening', 'C2C Only', 0, NULL),
      ('Screening', 'Unreachable', 1, NULL),
      ('Screening', 'Candidate Withdrew', 2, NULL),
      ('Screening', 'Not a Fit', 3, NULL),
      ('Screening', 'Requires Sponsorship', 4, NULL),
      ('Interview', 'Candidate Withdrew', 0, NULL),
      ('Interview', 'Not a Fit', 1, NULL),
      ('Submission', 'Rejected by MSP', 0, NULL),
      ('Submission', 'Rejected by Client', 1, NULL),
      ('Submission', 'Candidate Withdrew', 2, NULL),
      ('Compliance', 'Verification Failed', 0, NULL),
      ('Compliance', 'Candidate Withdrew', 1, NULL),
      ('Offer & Agreement', 'Offer Declined', 0, NULL),
      ('Step 1 · Quick Match', 'Not a Fit', 0, 'This stage is before the candidate is contacted, only based on the resume and documents submitted.'),
      ('Step 2 · Verifications', 'C2C Only', 0, NULL),
      ('Step 2 · Verifications', 'Unreachable', 1, NULL),
      ('Step 2 · Verifications', 'Candidate Withdrew', 2, NULL),
      ('Step 2 · Verifications', 'Not a Fit', 3, NULL),
      ('Step 2 · Verifications', 'Requires Sponsorship', 4, NULL),
      ('Step 3 · Follow-Up', 'Unreachable', 0, NULL),
      ('Step 3 · Follow-Up', 'Candidate Withdrew', 1, NULL),
      ('Step 3 · Follow-Up', 'Not a Fit', 2, NULL),
      ('Step 4 · Deep Match', 'Not a Fit', 0, NULL),
      ('Step 5 · Submission', 'Rejected by MSP', 0, NULL),
      ('Step 5 · Submission', 'Rejected by Client', 1, NULL),
      ('Step 5 · Submission', 'Candidate Withdrew', 2, NULL)
  ) AS seed(stage_name, code, sort_order, note)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.application_status_stage_reason_codes existing
    WHERE existing.tenant_id = p_tenant_id
      AND existing.workflow_id IS NULL
      AND existing.stage_name = seed.stage_name
      AND lower(btrim(existing.code)) = lower(btrim(seed.code))
  );

  UPDATE public.application_status_stage_reason_codes
  SET note = 'This stage is before the candidate is contacted, only based on the resume and documents submitted.'
  WHERE tenant_id = p_tenant_id
    AND workflow_id IS NULL
    AND stage_name IN ('Intake', 'Step 1 · Quick Match')
    AND lower(btrim(code)) = 'not a fit'
    AND note IS DISTINCT FROM 'This stage is before the candidate is contacted, only based on the resume and documents submitted.';

  INSERT INTO public.application_status_stage_buttons (
    tenant_id, stage_name, workflow_id, show_alternate, show_closed
  )
  SELECT p_tenant_id, seed.stage_name, NULL, seed.show_alternate, true
  FROM (
    VALUES
      ('Intake', false),
      ('Screening', true),
      ('Interview', true),
      ('Submission', true),
      ('Compliance', true),
      ('Offer & Agreement', true),
      ('Step 1 · Quick Match', false),
      ('Step 2 · Verifications', true),
      ('Step 3 · Follow-Up', true),
      ('Step 4 · Deep Match', false),
      ('Step 5 · Submission', true)
  ) AS seed(stage_name, show_alternate)
  ON CONFLICT (tenant_id, stage_name) WHERE workflow_id IS NULL
  DO UPDATE SET
    show_alternate = EXCLUDED.show_alternate,
    show_closed = EXCLUDED.show_closed;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_stage_status_catalog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_stage_status_catalog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_stage_status_catalog(uuid) TO service_role;

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

  PERFORM public.ensure_default_stage_status_catalog(p_tenant_id);
END;
$$;

DO $$
DECLARE
  v_tenant uuid;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants
  LOOP
    PERFORM public.ensure_default_stage_status_catalog(v_tenant);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
