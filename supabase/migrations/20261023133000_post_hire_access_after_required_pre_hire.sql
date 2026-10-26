-- Post-Hire applicant access follows the application phase.
-- The phase moves to post_hire only after every required Pre-Hire step is finished,
-- so hired status or worker conversion is no longer required to read or write those steps.

CREATE OR REPLACE FUNCTION public.applicant_may_read_onboarding_step(
  p_worker_id uuid,
  p_tenant_id uuid,
  p_application_id uuid,
  p_step_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_phase text;
  v_step_phase text;
  v_suspended timestamptz;
BEGIN
  v_step_phase := COALESCE(public.step_lifecycle_phase(p_step_id), 'pre_hire');

  IF v_step_phase = 'pre_hire' THEN
    RETURN true;
  END IF;

  IF p_application_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT ja.workflow_phase, ja.post_hire_suspended_at
    INTO v_phase, v_suspended
  FROM public.job_applications ja
  WHERE ja.id = p_application_id
    AND ja.tenant_id = p_tenant_id;

  RETURN COALESCE(v_phase, 'pre_hire') = 'post_hire' AND v_suspended IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.applicant_may_write_onboarding_step(
  p_worker_id uuid,
  p_tenant_id uuid,
  p_application_id uuid,
  p_step_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_phase text;
  v_step_phase text;
  v_suspended timestamptz;
BEGIN
  v_step_phase := COALESCE(public.step_lifecycle_phase(p_step_id), 'pre_hire');

  IF p_application_id IS NULL THEN
    v_phase := 'pre_hire';
  ELSE
    SELECT ja.workflow_phase, ja.post_hire_suspended_at
      INTO v_phase, v_suspended
    FROM public.job_applications ja
    WHERE ja.id = p_application_id
      AND ja.tenant_id = p_tenant_id;

    v_phase := COALESCE(v_phase, 'pre_hire');
  END IF;

  IF v_phase = 'completed' THEN
    RETURN false;
  END IF;

  IF v_step_phase = 'post_hire' THEN
    RETURN v_phase = 'post_hire' AND v_suspended IS NULL;
  END IF;

  RETURN v_phase = 'pre_hire';
END;
$$;

REVOKE ALL ON FUNCTION public.applicant_may_read_onboarding_step(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.applicant_may_read_onboarding_step(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.applicant_may_read_onboarding_step(uuid, uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.applicant_may_write_onboarding_step(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.applicant_may_write_onboarding_step(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.applicant_may_write_onboarding_step(uuid, uuid, uuid, uuid) TO service_role;
