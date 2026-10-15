-- Remove the AI Analysis Workflow Status Catalog as a duplicate source of truth.
-- Candidate application statuses, history, notes, and AI match progression stay intact.
-- Status actions in AI Analysis resolve exclusively from Pre-Hire stage catalog rows.

DO $$
DECLARE
  ai_stages text[] := ARRAY[
    'Step 1 · Quick Match',
    'Step 2 · Verifications',
    'Step 3 · Follow-Up',
    'Step 4 · Deep Match',
    'Step 5 · Submission'
  ];
BEGIN
  -- Config rows only (not application_statuses, job_applications, or status history).
  IF to_regclass('public.application_status_stage_lanes') IS NOT NULL THEN
    DELETE FROM public.application_status_stage_lanes WHERE stage_name = ANY (ai_stages);
  END IF;
  IF to_regclass('public.application_status_stage_buttons') IS NOT NULL THEN
    DELETE FROM public.application_status_stage_buttons WHERE stage_name = ANY (ai_stages);
  END IF;
  IF to_regclass('public.application_status_stage_reason_codes') IS NOT NULL THEN
    DELETE FROM public.application_status_stage_reason_codes WHERE stage_name = ANY (ai_stages);
  END IF;
  IF to_regclass('public.application_status_stage_notes') IS NOT NULL THEN
    IF to_regclass('public.application_status_stage_lanes') IS NOT NULL THEN
      UPDATE public.application_status_stage_lanes AS lanes
      SET note_id = NULL
      WHERE note_id IN (
        SELECT id
        FROM public.application_status_stage_notes
        WHERE stage_name = ANY (ai_stages)
      );
    END IF;
    DELETE FROM public.application_status_stage_notes WHERE stage_name = ANY (ai_stages);
  END IF;
  IF to_regclass('public.application_status_group_stage_assignments') IS NOT NULL THEN
    DELETE FROM public.application_status_group_stage_assignments WHERE stage_name = ANY (ai_stages);
  END IF;
  IF to_regclass('public.application_status_stage_assignments') IS NOT NULL THEN
    DELETE FROM public.application_status_stage_assignments WHERE stage_name = ANY (ai_stages);
  END IF;
END $$;

-- Tighten CHECK constraints to Pre-Hire stages only.
ALTER TABLE public.application_status_stage_lanes
  DROP CONSTRAINT IF EXISTS application_status_stage_lanes_stage_chk;
ALTER TABLE public.application_status_stage_lanes
  ADD CONSTRAINT application_status_stage_lanes_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals'
    )
  );

ALTER TABLE public.application_status_stage_buttons
  DROP CONSTRAINT IF EXISTS application_status_stage_buttons_stage_chk;
ALTER TABLE public.application_status_stage_buttons
  ADD CONSTRAINT application_status_stage_buttons_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals'
    )
  );

ALTER TABLE public.application_status_stage_reason_codes
  DROP CONSTRAINT IF EXISTS application_status_stage_reason_codes_stage_chk;
ALTER TABLE public.application_status_stage_reason_codes
  ADD CONSTRAINT application_status_stage_reason_codes_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals'
    )
  );

ALTER TABLE public.application_status_stage_notes
  DROP CONSTRAINT IF EXISTS application_status_stage_notes_stage_chk;
ALTER TABLE public.application_status_stage_notes
  ADD CONSTRAINT application_status_stage_notes_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals'
    )
  );

ALTER TABLE public.application_status_group_stage_assignments
  DROP CONSTRAINT IF EXISTS application_status_group_stage_assignments_stage_chk;
ALTER TABLE public.application_status_group_stage_assignments
  ADD CONSTRAINT application_status_group_stage_assignments_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals'
    )
  );

DO $$
BEGIN
  IF to_regclass('public.application_status_stage_assignments') IS NOT NULL THEN
    ALTER TABLE public.application_status_stage_assignments
      DROP CONSTRAINT IF EXISTS application_status_stage_assignments_stage_chk;
    ALTER TABLE public.application_status_stage_assignments
      ADD CONSTRAINT application_status_stage_assignments_stage_chk CHECK (
        stage_name IN (
          'Intake',
          'Screening',
          'Interview',
          'Submission',
          'Compliance',
          'Offer & Agreement',
          'Approvals'
        )
      );
  END IF;
END $$;

-- New tenants must seed Pre-Hire catalog rows only (no AI Analysis stages).
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
    IF NOT EXISTS (
      SELECT 1
      FROM public.application_statuses s
      WHERE s.tenant_id = p_tenant_id
        AND regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(btrim(rec.name)), '[^a-z0-9]+', '', 'g')
    ) THEN
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
        ('Offer & Agreement', 'Application Closed', 'closed', 0)
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
      ('Offer & Agreement', 'Offer Declined', 0, NULL)
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
    AND stage_name = 'Intake'
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
      ('Offer & Agreement', true)
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
