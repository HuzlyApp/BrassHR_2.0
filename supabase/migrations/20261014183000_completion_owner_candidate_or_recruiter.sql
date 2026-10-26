-- Completion owner is now a two-option dropdown: Candidate (applicant) or Recruiter (recruiter_or_hr).
-- Rewrite every stored owner onto one of the two. Mirrors resolveCompletionOwner in
-- lib/onboarding/workflow-settings.ts, so candidate/staff ownership of each step is unchanged.

CREATE OR REPLACE FUNCTION public.tmp_canonical_completion_owner(owner text, library_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(library_id, ''))) IN (
      'manager-facility-approval', 'hr-final-approval', 'recruiter-screening',
      'interview-qualification', 'client-review', 'candidate-selection', 'release-to-client',
      'submit-to-msp', 'reference-verification', 'oig-exclusion-check', 'drug-test-screening',
      'welcome-email', 'status-update-notification', 'manager-welcome-call',
      'final-onboarding-call', 'payroll-profile-creation', 'pay-rate-hire-date',
      'schedule-assignment', 'badge-equipment-issuance', 'facility-access-setup',
      'buddy-mentor-assignment', 'benefits-confirmation', 'adverse-action-process',
      'conditional-branch-decision'
    ) THEN 'recruiter_or_hr'
    WHEN lower(btrim(coalesce(owner, ''))) IN ('', 'applicant', 'contractor', 'worker', 'applicant_or_hr')
      THEN 'applicant'
    ELSE 'recruiter_or_hr'
  END
$$;

CREATE OR REPLACE FUNCTION public.tmp_canonical_builder_nodes(nodes jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(e.n -> 'settings') = 'object' THEN jsonb_set(
          e.n,
          '{settings,completionOwner}',
          to_jsonb(public.tmp_canonical_completion_owner(e.n -> 'settings' ->> 'completionOwner', e.n ->> 'stepId'))
        )
        ELSE e.n
      END
      ORDER BY e.ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(nodes) WITH ORDINALITY AS e(n, ord)
$$;

-- Builder steps
UPDATE public.onboarding_flow_steps
SET settings = jsonb_set(
  settings,
  '{completionOwner}',
  to_jsonb(public.tmp_canonical_completion_owner(
    settings ->> 'completionOwner',
    coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
  ))
)
WHERE jsonb_typeof(settings) = 'object'
  AND settings ->> 'completionOwner' IS DISTINCT FROM public.tmp_canonical_completion_owner(
    settings ->> 'completionOwner',
    coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
  );

UPDATE public.onboarding_flow_steps
SET completion_owner = public.tmp_canonical_completion_owner(
  completion_owner,
  coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
)
WHERE completion_owner IS NOT NULL
  AND completion_owner IS DISTINCT FROM public.tmp_canonical_completion_owner(
    completion_owner,
    coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
  );

UPDATE public.onboarding_template_steps
SET settings = jsonb_set(
  settings,
  '{completionOwner}',
  to_jsonb(public.tmp_canonical_completion_owner(
    settings ->> 'completionOwner',
    coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
  ))
)
WHERE jsonb_typeof(settings) = 'object'
  AND settings ->> 'completionOwner' IS DISTINCT FROM public.tmp_canonical_completion_owner(
    settings ->> 'completionOwner',
    coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
  );

UPDATE public.onboarding_template_steps
SET completion_owner = public.tmp_canonical_completion_owner(
  completion_owner,
  coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
)
WHERE completion_owner IS NOT NULL
  AND completion_owner IS DISTINCT FROM public.tmp_canonical_completion_owner(
    completion_owner,
    coalesce(nullif(metadata ->> 'library_step_key', ''), step_type)
  );

-- Builder canvas drafts
UPDATE public.onboarding_flows
SET builder_draft = jsonb_set(builder_draft, '{nodes}', public.tmp_canonical_builder_nodes(builder_draft -> 'nodes'))
WHERE jsonb_typeof(builder_draft -> 'nodes') = 'array'
  AND builder_draft -> 'nodes' IS DISTINCT FROM public.tmp_canonical_builder_nodes(builder_draft -> 'nodes');

UPDATE public.onboarding_templates
SET builder_draft = jsonb_set(builder_draft, '{nodes}', public.tmp_canonical_builder_nodes(builder_draft -> 'nodes'))
WHERE jsonb_typeof(builder_draft -> 'nodes') = 'array'
  AND builder_draft -> 'nodes' IS DISTINCT FROM public.tmp_canonical_builder_nodes(builder_draft -> 'nodes');

UPDATE public.tenant_onboarding_configs
SET builder_draft = jsonb_set(builder_draft, '{nodes}', public.tmp_canonical_builder_nodes(builder_draft -> 'nodes'))
WHERE jsonb_typeof(builder_draft -> 'nodes') = 'array'
  AND builder_draft -> 'nodes' IS DISTINCT FROM public.tmp_canonical_builder_nodes(builder_draft -> 'nodes');

-- Published runtime steps
UPDATE public.tenant_onboarding_steps
SET metadata = jsonb_set(
  metadata,
  '{workflow_settings,completionOwner}',
  to_jsonb(public.tmp_canonical_completion_owner(
    metadata -> 'workflow_settings' ->> 'completionOwner',
    metadata ->> 'workflow_step_id'
  ))
)
WHERE jsonb_typeof(metadata -> 'workflow_settings') = 'object'
  AND metadata -> 'workflow_settings' ->> 'completionOwner' IS DISTINCT FROM public.tmp_canonical_completion_owner(
    metadata -> 'workflow_settings' ->> 'completionOwner',
    metadata ->> 'workflow_step_id'
  );

-- Per-candidate step copies
UPDATE public.applicant_workflow_step_records
SET settings = jsonb_set(
  settings,
  '{completionOwner}',
  to_jsonb(public.tmp_canonical_completion_owner(settings ->> 'completionOwner', step_type))
)
WHERE jsonb_typeof(settings) = 'object'
  AND settings ? 'completionOwner'
  AND settings ->> 'completionOwner' IS DISTINCT FROM public.tmp_canonical_completion_owner(
    settings ->> 'completionOwner',
    step_type
  );

UPDATE public.workflow_step_instances
SET settings = jsonb_set(
  settings,
  '{completionOwner}',
  to_jsonb(public.tmp_canonical_completion_owner(settings ->> 'completionOwner', step_type))
)
WHERE jsonb_typeof(settings) = 'object'
  AND settings ? 'completionOwner'
  AND settings ->> 'completionOwner' IS DISTINCT FROM public.tmp_canonical_completion_owner(
    settings ->> 'completionOwner',
    step_type
  );

DROP FUNCTION public.tmp_canonical_builder_nodes(jsonb);
DROP FUNCTION public.tmp_canonical_completion_owner(text, text);
