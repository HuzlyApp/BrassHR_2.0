-- Denormalize application + document inventory onto public.workers at conversion
-- so the Workers list/profile can load from workers alone (no candidate table join).
-- Candidate person row stays in public.worker as status=converted (FK identity for
-- job_applications / storage paths); it is excluded from Candidates lists.

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS profile_photo text,
  ADD COLUMN IF NOT EXISTS application_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS documents_manifest jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.workers.profile_photo IS
  'Copied from public.worker.profile_photo at conversion for workers-list-only reads.';
COMMENT ON COLUMN public.workers.application_snapshot IS
  'Snapshot of the source job_application linked at conversion.';
COMMENT ON COLUMN public.workers.documents_manifest IS
  'Inventory of resume/document storage paths carried from candidate tables at conversion.';

-- Build documents_manifest for a candidate (person) id.
CREATE OR REPLACE FUNCTION public.build_employment_worker_documents_manifest(
  p_tenant_id uuid,
  p_candidate_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_legacy public.worker_documents%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source', 'worker_resumes',
        'id', wr.id,
        'title', coalesce(nullif(wr.original_file_name, ''), nullif(wr.file_name, ''), 'Resume'),
        'path', coalesce(nullif(wr.storage_path, ''), nullif(wr.file_url, '')),
        'bucket', 'worker-resumes',
        'applicationId', wr.job_application_id,
        'uploadedAt', wr.uploaded_at
      )
      ORDER BY wr.uploaded_at DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.worker_resumes wr
  WHERE wr.tenant_id = p_tenant_id
    AND wr.worker_id = p_candidate_id
    AND wr.deleted_at IS NULL
    AND coalesce(nullif(wr.storage_path, ''), nullif(wr.file_url, '')) IS NOT NULL;

  SELECT coalesce(v_items, '[]'::jsonb) || coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'source', 'worker_submitted_documents',
          'id', wsd.id,
          'title', coalesce(nullif(wsd.original_file_name, ''), 'Submitted document'),
          'path', nullif(wsd.file_url, ''),
          'bucket', 'worker_required_files',
          'applicationId', wsd.application_id,
          'status', wsd.status,
          'uploadedAt', wsd.uploaded_at
        )
        ORDER BY wsd.uploaded_at DESC NULLS LAST
      )
      FROM public.worker_submitted_documents wsd
      WHERE wsd.tenant_id = p_tenant_id
        AND wsd.worker_id = p_candidate_id
        AND nullif(wsd.file_url, '') IS NOT NULL
    ),
    '[]'::jsonb
  )
  INTO v_items;

  FOR v_legacy IN
    SELECT *
    FROM public.worker_documents wd
    WHERE wd.tenant_id = p_tenant_id
      AND wd.worker_id = p_candidate_id
  LOOP
    IF nullif(trim(v_legacy.document_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'document_url',
        'path', trim(v_legacy.document_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'document_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.ssn_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'ssn_url',
        'path', trim(v_legacy.ssn_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'ssn_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.ssn_back_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'ssn_back_url',
        'path', trim(v_legacy.ssn_back_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'ssn_back_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.drivers_license_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'drivers_license_url',
        'path', trim(v_legacy.drivers_license_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'drivers_license_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.drivers_license_back_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'drivers_license_back_url',
        'path', trim(v_legacy.drivers_license_back_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'drivers_license_back_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.cpr_certification_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'cpr_certification_url',
        'path', trim(v_legacy.cpr_certification_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'cpr_certification_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.nursing_license_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'nursing_license_url',
        'path', trim(v_legacy.nursing_license_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'nursing_license_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.tb_test_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'tb_test_url',
        'path', trim(v_legacy.tb_test_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'tb_test_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.agreement_w2_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'agreement_w2_url',
        'path', trim(v_legacy.agreement_w2_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'agreement_w2_url'
      ));
    END IF;
    IF nullif(trim(v_legacy.agreement_i9_url), '') IS NOT NULL THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'source', 'worker_documents', 'id', v_legacy.id, 'title', 'agreement_i9_url',
        'path', trim(v_legacy.agreement_i9_url), 'bucket', 'worker_required_files',
        'applicationId', v_legacy.application_id, 'field', 'agreement_i9_url'
      ));
    END IF;
  END LOOP;

  RETURN coalesce(v_items, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.build_employment_worker_documents_manifest(uuid, uuid) IS
  'Collect resume/document storage references for a candidate into a JSON array for workers.documents_manifest.';

CREATE OR REPLACE FUNCTION public.build_employment_worker_application_snapshot(
  p_tenant_id uuid,
  p_application_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snap jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_application_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'id', ja.id,
    'status', ja.status,
    'jobRequisitionId', ja.job_requisition_id,
    'submittedAt', ja.submitted_at,
    'hiredAt', ja.hired_at,
    'workflowPhase', ja.workflow_phase,
    'source', ja.source,
    'aiMatchScore', ja.ai_match_score
  )
  INTO v_snap
  FROM public.job_applications ja
  WHERE ja.tenant_id = p_tenant_id
    AND ja.id = p_application_id;

  RETURN coalesce(v_snap, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_candidate_to_employment_worker(
  p_tenant_id uuid,
  p_candidate_id uuid,
  p_worker_type text,
  p_source_job_application_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text;
  v_candidate public.worker%ROWTYPE;
  v_existing public.workers%ROWTYPE;
  v_worker_id uuid;
  v_created boolean := false;
  v_converted_at timestamptz := now();
  v_classification text;
  v_tax boolean;
  v_payroll boolean;
  v_contractor boolean;
  v_location text;
  v_app_id uuid;
  v_app_snapshot jsonb := '{}'::jsonb;
  v_docs_manifest jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id and candidate_id are required';
  END IF;

  v_type := lower(trim(coalesce(p_worker_type, '')));
  IF v_type IN ('w-2') THEN
    v_type := 'w2';
  END IF;
  IF v_type NOT IN ('w2', '1099') THEN
    RAISE EXCEPTION 'Invalid worker_type. Expected w2 or 1099.';
  END IF;

  SELECT * INTO v_candidate
  FROM public.worker w
  WHERE w.id = p_candidate_id
    AND w.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Candidate not found',
      'code', 'NOT_FOUND'
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.workers emp
  WHERE emp.candidate_id = p_candidate_id
  FOR UPDATE;

  IF FOUND THEN
    v_app_id := coalesce(v_existing.source_job_application_id, p_source_job_application_id);
    IF v_app_id IS NULL THEN
      SELECT ja.id INTO v_app_id
      FROM public.job_applications ja
      WHERE ja.tenant_id = p_tenant_id
        AND ja.worker_id = p_candidate_id
      ORDER BY coalesce(ja.submitted_at, ja.created_at) DESC NULLS LAST
      LIMIT 1;
    END IF;

    v_app_snapshot := public.build_employment_worker_application_snapshot(p_tenant_id, v_app_id);
    v_docs_manifest := public.build_employment_worker_documents_manifest(p_tenant_id, p_candidate_id);

    UPDATE public.worker w
    SET
      status = 'converted',
      converted_worker_type = coalesce(nullif(w.converted_worker_type, ''), v_existing.worker_type),
      converted_at = coalesce(w.converted_at, v_existing.converted_at, v_converted_at),
      updated_at = v_converted_at
    WHERE w.id = p_candidate_id
      AND w.tenant_id = p_tenant_id
      AND (
        lower(coalesce(w.status, '')) <> 'converted'
        OR w.converted_worker_type IS NULL
        OR w.converted_at IS NULL
      );

    -- Refresh transfer snapshot so Workers page stays self-contained.
    UPDATE public.workers emp
    SET
      profile_photo = coalesce(nullif(trim(v_candidate.profile_photo), ''), emp.profile_photo),
      job_role = coalesce(nullif(trim(v_candidate.job_role), ''), emp.job_role),
      location = coalesce(
        nullif(
          trim(both ', ' FROM concat_ws(', ', nullif(trim(v_candidate.city), ''), nullif(trim(v_candidate.state), ''))),
          ''
        ),
        emp.location
      ),
      source_job_application_id = coalesce(emp.source_job_application_id, v_app_id),
      application_snapshot = CASE
        WHEN v_app_snapshot <> '{}'::jsonb THEN v_app_snapshot
        ELSE emp.application_snapshot
      END,
      documents_manifest = CASE
        WHEN jsonb_array_length(v_docs_manifest) > 0 THEN v_docs_manifest
        ELSE emp.documents_manifest
      END,
      updated_at = v_converted_at
    WHERE emp.id = v_existing.id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'workerRecordId', v_existing.id,
      'candidateId', p_candidate_id,
      'workerType', v_existing.worker_type,
      'sourceJobApplicationId', coalesce(v_existing.source_job_application_id, v_app_id),
      'convertedAt', coalesce(v_existing.converted_at, v_converted_at),
      'documentsCount', jsonb_array_length(
        coalesce(
          (SELECT documents_manifest FROM public.workers WHERE id = v_existing.id),
          '[]'::jsonb
        )
      )
    );
  END IF;

  IF lower(coalesce(v_candidate.status, '')) = 'converted' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This candidate has already been converted.',
      'code', 'ALREADY_CONVERTED'
    );
  END IF;

  IF lower(coalesce(v_candidate.status, '')) NOT IN ('approved', 'for_approval') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only for-approval or approved candidates can be converted to workers.',
      'code', 'INELIGIBLE_STATUS',
      'status', v_candidate.status
    );
  END IF;

  IF v_type = 'w2' THEN
    v_classification := 'employee';
    v_tax := true;
    v_payroll := true;
    v_contractor := false;
  ELSE
    v_classification := 'contractor';
    v_tax := false;
    v_payroll := false;
    v_contractor := true;
  END IF;

  v_location := nullif(
    trim(both ', ' FROM concat_ws(', ', nullif(trim(v_candidate.city), ''), nullif(trim(v_candidate.state), ''))),
    ''
  );

  v_app_id := p_source_job_application_id;
  IF v_app_id IS NULL THEN
    SELECT ja.id INTO v_app_id
    FROM public.job_applications ja
    WHERE ja.tenant_id = p_tenant_id
      AND ja.worker_id = p_candidate_id
    ORDER BY coalesce(ja.submitted_at, ja.created_at) DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_app_snapshot := public.build_employment_worker_application_snapshot(p_tenant_id, v_app_id);
  v_docs_manifest := public.build_employment_worker_documents_manifest(p_tenant_id, p_candidate_id);

  INSERT INTO public.workers (
    tenant_id,
    candidate_id,
    first_name,
    last_name,
    email,
    phone,
    job_role,
    location,
    status,
    worker_type,
    employment_classification,
    tax_withholding_required,
    payroll_enabled,
    contractor_payment_enabled,
    conversion_status,
    converted_at,
    source_job_application_id,
    profile_photo,
    application_snapshot,
    documents_manifest,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_candidate_id,
    nullif(trim(v_candidate.first_name), ''),
    nullif(trim(v_candidate.last_name), ''),
    nullif(trim(v_candidate.email), ''),
    nullif(trim(v_candidate.phone), ''),
    nullif(trim(v_candidate.job_role), ''),
    v_location,
    'active',
    v_type,
    v_classification,
    v_tax,
    v_payroll,
    v_contractor,
    'converted',
    v_converted_at,
    v_app_id,
    nullif(trim(v_candidate.profile_photo), ''),
    v_app_snapshot,
    v_docs_manifest,
    v_converted_at
  )
  RETURNING id INTO v_worker_id;

  v_created := true;

  -- Soft-retire from Candidates pipeline (hard delete would break FKs / storage paths).
  UPDATE public.worker w
  SET
    status = 'converted',
    converted_worker_type = v_type,
    converted_at = v_converted_at,
    updated_at = v_converted_at
  WHERE w.id = p_candidate_id
    AND w.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'workerRecordId', v_worker_id,
    'candidateId', p_candidate_id,
    'workerType', v_type,
    'sourceJobApplicationId', v_app_id,
    'convertedAt', v_converted_at,
    'actorUserId', p_actor_user_id,
    'documentsCount', jsonb_array_length(v_docs_manifest)
  );
END;
$$;

COMMENT ON FUNCTION public.convert_candidate_to_employment_worker(uuid, uuid, text, uuid, uuid) IS
  'Atomically create public.workers with application/document transfer snapshot and mark public.worker converted. Idempotent per candidate_id.';

REVOKE ALL ON FUNCTION public.build_employment_worker_documents_manifest(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_employment_worker_documents_manifest(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.build_employment_worker_application_snapshot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_employment_worker_application_snapshot(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.convert_candidate_to_employment_worker(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_candidate_to_employment_worker(uuid, uuid, text, uuid, uuid) TO service_role;

-- Backfill existing employment rows from their linked candidate + application.
UPDATE public.workers emp
SET
  profile_photo = coalesce(
    emp.profile_photo,
    nullif(trim(w.profile_photo), '')
  ),
  job_role = coalesce(emp.job_role, nullif(trim(w.job_role), '')),
  location = coalesce(
    nullif(trim(emp.location), ''),
    nullif(
      trim(both ', ' FROM concat_ws(', ', nullif(trim(w.city), ''), nullif(trim(w.state), ''))),
      ''
    )
  ),
  application_snapshot = CASE
    WHEN emp.application_snapshot IS DISTINCT FROM '{}'::jsonb THEN emp.application_snapshot
    ELSE public.build_employment_worker_application_snapshot(
      emp.tenant_id,
      emp.source_job_application_id
    )
  END,
  documents_manifest = CASE
    WHEN jsonb_typeof(emp.documents_manifest) = 'array'
      AND jsonb_array_length(emp.documents_manifest) > 0
    THEN emp.documents_manifest
    ELSE public.build_employment_worker_documents_manifest(emp.tenant_id, emp.candidate_id)
  END,
  updated_at = now()
FROM public.worker w
WHERE w.id = emp.candidate_id
  AND w.tenant_id = emp.tenant_id;
