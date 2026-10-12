-- Zipstaff AI analysis catalog. The five AI steps are separate stage names
-- from Pre-Hire, so the Pre-Hire seed does not appear there.
-- Status rows are reused. Pre-Hire lanes, candidate assignments, and other tenants stay.

DO $seed$
DECLARE
  v_tenant uuid := 'efe85d96-536e-497b-9e1a-d8876d29feea';
  v_status uuid;
  rec record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant) THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT *
    FROM (
      VALUES
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
    WHERE s.tenant_id = v_tenant
      AND regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g')
        = regexp_replace(lower(btrim(rec.status_name)), '[^a-z0-9]+', '', 'g')
    ORDER BY s.is_active DESC, s.created_at
    LIMIT 1;

    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Missing status % for Zipstaff AI analysis seed', rec.status_name;
    END IF;

    INSERT INTO public.application_status_stage_lanes (
      tenant_id, stage_name, status_id, lane, sort_order, workflow_id
    )
    VALUES (v_tenant, rec.stage_name, v_status, rec.lane, rec.sort_order, NULL)
    ON CONFLICT (tenant_id, stage_name, status_id) WHERE workflow_id IS NULL
    DO UPDATE SET
      lane = EXCLUDED.lane,
      sort_order = EXCLUDED.sort_order;
  END LOOP;

  INSERT INTO public.application_status_stage_reason_codes (
    tenant_id, stage_name, code, sort_order, workflow_id
  )
  SELECT v_tenant, seed.stage_name, seed.code, seed.sort_order, NULL
  FROM (
    VALUES
      ('Step 1 · Quick Match', 'Not a Fit', 0),
      ('Step 2 · Verifications', 'C2C Only', 0),
      ('Step 2 · Verifications', 'Unreachable', 1),
      ('Step 2 · Verifications', 'Candidate Withdrew', 2),
      ('Step 2 · Verifications', 'Not a Fit', 3),
      ('Step 2 · Verifications', 'Requires Sponsorship', 4),
      ('Step 3 · Follow-Up', 'Unreachable', 0),
      ('Step 3 · Follow-Up', 'Candidate Withdrew', 1),
      ('Step 3 · Follow-Up', 'Not a Fit', 2),
      ('Step 4 · Deep Match', 'Not a Fit', 0),
      ('Step 5 · Submission', 'Rejected by MSP', 0),
      ('Step 5 · Submission', 'Rejected by Client', 1),
      ('Step 5 · Submission', 'Candidate Withdrew', 2)
  ) AS seed(stage_name, code, sort_order)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.application_status_stage_reason_codes existing
    WHERE existing.tenant_id = v_tenant
      AND existing.workflow_id IS NULL
      AND existing.stage_name = seed.stage_name
      AND lower(btrim(existing.code)) = lower(btrim(seed.code))
  );

  UPDATE public.application_status_stage_reason_codes
  SET note = 'This stage is before the candidate is contacted, only based on the resume and documents submitted.'
  WHERE tenant_id = v_tenant
    AND workflow_id IS NULL
    AND stage_name = 'Step 1 · Quick Match'
    AND lower(btrim(code)) = 'not a fit'
    AND note IS DISTINCT FROM 'This stage is before the candidate is contacted, only based on the resume and documents submitted.';

  INSERT INTO public.application_status_stage_buttons (
    tenant_id, stage_name, workflow_id, show_alternate, show_closed
  )
  SELECT v_tenant, seed.stage_name, NULL, seed.show_alternate, seed.show_closed
  FROM (
    VALUES
      ('Step 1 · Quick Match', false, true),
      ('Step 2 · Verifications', true, true),
      ('Step 3 · Follow-Up', true, true),
      ('Step 4 · Deep Match', false, true),
      ('Step 5 · Submission', true, true)
  ) AS seed(stage_name, show_alternate, show_closed)
  ON CONFLICT (tenant_id, stage_name) WHERE workflow_id IS NULL
  DO UPDATE SET
    show_alternate = EXCLUDED.show_alternate,
    show_closed = EXCLUDED.show_closed;
END
$seed$;

-- Rollback: delete Zipstaff tenant-default lanes, reason codes, and button
-- prefs for the five AI step names only.
-- DELETE FROM public.application_status_stage_lanes
-- WHERE tenant_id = 'efe85d96-536e-497b-9e1a-d8876d29feea'
--   AND workflow_id IS NULL
--   AND stage_name LIKE 'Step %';
