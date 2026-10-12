-- Zipstaff Pre-Hire catalog. Stages were empty because no lane rows existed.
-- This seed links the sheet's statuses onto the tenant-default Pre-Hire list.
-- AI analysis stages are not touched. Existing status ids and candidate assignments stay.

ALTER TABLE public.application_status_stage_reason_codes
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.application_status_stage_reason_codes
  DROP CONSTRAINT IF EXISTS application_status_stage_reason_codes_note_len_chk;

ALTER TABLE public.application_status_stage_reason_codes
  ADD CONSTRAINT application_status_stage_reason_codes_note_len_chk
  CHECK (note IS NULL OR char_length(note) <= 2000);

DO $seed$
DECLARE
  v_tenant uuid := 'efe85d96-536e-497b-9e1a-d8876d29feea';
  v_status uuid;
  v_sort integer;
  rec record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant) THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('New/ Applied', 'newapplied'),
        ('Resume Verified', 'resumeverified'),
        ('Documents Verified', 'documentsverified'),
        ('Application Closed', 'applicationclosed'),
        ('Attempted Contact', 'attemptedcontact'),
        ('Screening Complete', 'screeningcomplete'),
        ('Follow-up Needed', 'followupneeded'),
        ('Interview Scheduled', 'interviewscheduled'),
        ('Qualified', 'qualified'),
        ('Submitted to MSP', 'submittedtomsp'),
        ('MSP Approved', 'mspapproved'),
        ('Submitted to Client', 'submittedtoclient'),
        ('Client Approved', 'clientapproved'),
        ('Verification Complete', 'verificationcomplete'),
        ('Offer Accepted', 'offeraccepted')
    ) AS seed(name, match_key)
  LOOP
    SELECT s.id
    INTO v_status
    FROM public.application_statuses s
    WHERE s.tenant_id = v_tenant
      AND regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g') = rec.match_key
    ORDER BY s.is_active DESC, s.created_at
    LIMIT 1;

    IF v_status IS NULL THEN
      SELECT COALESCE(MAX(sort_order), -1) + 1
      INTO v_sort
      FROM public.application_statuses
      WHERE tenant_id = v_tenant;

      INSERT INTO public.application_statuses (
        tenant_id, name, sort_order, is_active, is_default
      )
      VALUES (v_tenant, rec.name, v_sort, true, false);
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
    WHERE s.tenant_id = v_tenant
      AND regexp_replace(lower(btrim(s.name)), '[^a-z0-9]+', '', 'g')
        = regexp_replace(lower(btrim(rec.status_name)), '[^a-z0-9]+', '', 'g')
    ORDER BY s.is_active DESC, s.created_at
    LIMIT 1;

    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Missing status % for Zipstaff Pre-Hire seed', rec.status_name;
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
      ('Intake', 'Not a Fit', 0),
      ('Screening', 'C2C Only', 0),
      ('Screening', 'Unreachable', 1),
      ('Screening', 'Candidate Withdrew', 2),
      ('Screening', 'Not a Fit', 3),
      ('Screening', 'Requires Sponsorship', 4),
      ('Interview', 'Candidate Withdrew', 0),
      ('Interview', 'Not a Fit', 1),
      ('Submission', 'Rejected by MSP', 0),
      ('Submission', 'Rejected by Client', 1),
      ('Submission', 'Candidate Withdrew', 2),
      ('Compliance', 'Verification Failed', 0),
      ('Compliance', 'Candidate Withdrew', 1),
      ('Offer & Agreement', 'Offer Declined', 0)
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
    AND stage_name = 'Intake'
    AND lower(btrim(code)) = 'not a fit'
    AND note IS DISTINCT FROM 'This stage is before the candidate is contacted, only based on the resume and documents submitted.';

  INSERT INTO public.application_status_stage_buttons (
    tenant_id, stage_name, workflow_id, show_alternate, show_closed
  )
  SELECT v_tenant, seed.stage_name, NULL, seed.show_alternate, seed.show_closed
  FROM (
    VALUES
      ('Intake', false, true),
      ('Screening', true, true),
      ('Interview', true, true),
      ('Submission', true, true),
      ('Compliance', true, true),
      ('Offer & Agreement', true, true)
  ) AS seed(stage_name, show_alternate, show_closed)
  ON CONFLICT (tenant_id, stage_name) WHERE workflow_id IS NULL
  DO UPDATE SET
    show_alternate = EXCLUDED.show_alternate,
    show_closed = EXCLUDED.show_closed;
END
$seed$;

NOTIFY pgrst, 'reload schema';

-- Rollback for Zipstaff only. Delete the tenant-default lane rows for the six
-- seeded stages, then delete statuses created by this seed that no application
-- references. Leave Follow-up Needed, Attempted Contact, and Interview Scheduled;
-- those records already existed.
-- DELETE FROM public.application_status_stage_lanes
-- WHERE tenant_id = 'efe85d96-536e-497b-9e1a-d8876d29feea'
--   AND workflow_id IS NULL
--   AND stage_name IN (
--     'Intake', 'Screening', 'Interview', 'Submission', 'Compliance', 'Offer & Agreement'
--   );
