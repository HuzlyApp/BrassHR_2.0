-- Steps carried a stageName from the other hire phase (e.g. "Offer & Agreement" on a Post-Hire step),
-- which put a Pre-Hire column on the Post-Hire board. The app now ignores cross-phase stage names;
-- this cleans the stored data the same way lib/onboarding/hire-stage-catalog.ts does:
-- known library steps get their phase's stage, everything else drops the explicit stageName.

CREATE OR REPLACE FUNCTION pg_temp.repaired_hire_stage_name(
  p_library_id text,
  p_phase text,
  p_stage text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH v AS (
    SELECT
      lower(replace(btrim(coalesce(p_library_id, '')), '_', '-')) AS lib,
      CASE WHEN lower(btrim(p_phase)) = 'post_hire' THEN 'post_hire' ELSE 'pre_hire' END AS lifecycle,
      lower(btrim(coalesce(p_stage, ''))) AS stage
  )
  SELECT CASE
    WHEN v.lifecycle = 'post_hire'
      AND v.stage IN ('intake', 'screening', 'interview', 'submission', 'compliance', 'offer & agreement', 'approvals')
    THEN CASE
      WHEN v.lib = 'pay-rate-hire-date' THEN 'Payroll & Pay'
      WHEN v.lib IN (
        'i9-right-to-work-verification', 'i9-section-1', 'custom-form', 'custom-application-form',
        'collect-extra-files', 'document-upload'
      ) THEN 'Paperwork'
      ELSE NULL
    END
    WHEN v.lifecycle = 'pre_hire'
      AND v.stage IN (
        'payroll & tax', 'access & systems', 'training & policy', 'welcome & complete',
        'kickoff', 'paperwork', 'payroll & pay', 'policies', 'access & equipment', 'training', 'day one ready'
      )
    THEN CASE
      WHEN v.lib = 'completion-milestone' THEN 'Approvals'
      WHEN v.lib = 'document-upload' THEN 'Intake'
      ELSE NULL
    END
    ELSE p_stage
  END
  FROM v;
$$;

-- Candidate workflow step records (Hire Journey board). Keep updated_at so open staff views
-- do not see a spurious concurrent edit.
ALTER TABLE public.applicant_workflow_step_records
  DISABLE TRIGGER trg_applicant_workflow_step_records_updated_at;

WITH fixes AS (
  SELECT
    r.id,
    pg_temp.repaired_hire_stage_name(
      r.step_type,
      coalesce(nullif(r.phase, ''), r.settings ->> 'phase'),
      r.settings ->> 'stageName'
    ) AS stage
  FROM public.applicant_workflow_step_records r
  WHERE coalesce(btrim(r.settings ->> 'stageName'), '') <> ''
    AND coalesce(nullif(r.phase, ''), nullif(r.settings ->> 'phase', '')) IS NOT NULL
)
UPDATE public.applicant_workflow_step_records r
SET settings = CASE
  WHEN f.stage IS NULL THEN r.settings - 'stageName'
  ELSE jsonb_set(r.settings, '{stageName}', to_jsonb(f.stage))
END
FROM fixes f
WHERE r.id = f.id
  AND f.stage IS DISTINCT FROM r.settings ->> 'stageName';

ALTER TABLE public.applicant_workflow_step_records
  ENABLE TRIGGER trg_applicant_workflow_step_records_updated_at;

-- Published tenant steps (source for new candidate workflow instances).
WITH fixes AS (
  SELECT
    s.id,
    pg_temp.repaired_hire_stage_name(
      s.metadata ->> 'workflow_step_id',
      s.metadata -> 'workflow_settings' ->> 'phase',
      s.metadata -> 'workflow_settings' ->> 'stageName'
    ) AS stage
  FROM public.tenant_onboarding_steps s
  WHERE jsonb_typeof(s.metadata -> 'workflow_settings') = 'object'
    AND coalesce(btrim(s.metadata -> 'workflow_settings' ->> 'stageName'), '') <> ''
    AND coalesce(btrim(s.metadata -> 'workflow_settings' ->> 'phase'), '') <> ''
)
UPDATE public.tenant_onboarding_steps s
SET metadata = jsonb_set(
  s.metadata,
  '{workflow_settings}',
  CASE
    WHEN f.stage IS NULL THEN (s.metadata -> 'workflow_settings') - 'stageName'
    ELSE jsonb_set(s.metadata -> 'workflow_settings', '{stageName}', to_jsonb(f.stage))
  END
)
FROM fixes f
WHERE s.id = f.id
  AND f.stage IS DISTINCT FROM s.metadata -> 'workflow_settings' ->> 'stageName';
