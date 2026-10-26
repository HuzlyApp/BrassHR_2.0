-- Replace the generic 1099, W2, and RNR system presets with industry-specific templates.
-- Steps, titles, and phases come from onboarding_step_library.

ALTER TABLE public.onboarding_templates
  ADD COLUMN IF NOT EXISTS industry_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_templates_industry_key_fkey'
      AND conrelid = 'public.onboarding_templates'::regclass
  ) THEN
    ALTER TABLE public.onboarding_templates
      ADD CONSTRAINT onboarding_templates_industry_key_fkey
      FOREIGN KEY (industry_key) REFERENCES public.industry_catalog (key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS onboarding_templates_employment_industry_idx
  ON public.onboarding_templates (employment_type, industry_key)
  WHERE type = 'preset';

DO $$
DECLARE
  spec record;
  new_template_id uuid;
  draft jsonb;
  missing text;
BEGIN
  CREATE TEMP TABLE desired_industry_templates (
    template_name text PRIMARY KEY,
    employment_type text NOT NULL,
    industry_key text NOT NULL,
    description text NOT NULL,
    steps text[] NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO desired_industry_templates (template_name, employment_type, industry_key, description, steps)
  VALUES
    (
      '1099 Workflow (Healthcare Industry)',
      '1099',
      'healthcare',
      'Healthcare 1099 contractor workflow.',
      ARRAY[
        'resume-basic-profile','parameterized-job-application','collect-extra-files','collect-references','custom-form',
        'recruiter-screening','skill-qualification-assessment','reference-verification',
        'interview-qualification','follow-up-interview','internal-select',
        'submit-to-msp','submit-to-client','manager-facility-approval','release-to-client',
        'authorization-esign','background-check','drug-test-screening','oig-exclusion-check','credential-license-verification','ssn-identity-verification','adverse-action-process',
        'pay-rate-hire-date','offer-prep','manager-approval','employee-agreement','offer-acceptance',
        'hr-final-approval','pre-hire-completion-milestone',
        'manager-welcome-call','welcome-packet-esign',
        'payroll-profile-creation','w9','direct-deposit-setup',
        'system-access','badge-equipment-issuance','equipment-badge-acknowledgment','schedule-assignment','facility-access-setup',
        'orientation-video','policy-acknowledgment','safety-training','training-modules-quiz','compliance-training','certification-upload','health-screening-waiver',
        'buddy-mentor-assignment','post-hire-completion-milestone'
      ]
    ),
    (
      'W2 Workflow (Healthcare Industry)',
      'W2',
      'healthcare',
      'Healthcare W2 employee workflow.',
      ARRAY[
        'resume-basic-profile','parameterized-job-application','collect-extra-files','collect-references',
        'recruiter-screening','skill-qualification-assessment','reference-verification',
        'interview-qualification','follow-up-interview','internal-select',
        'submit-to-msp','submit-to-client','manager-facility-approval',
        'authorization-esign','background-check','drug-test-screening','oig-exclusion-check','credential-license-verification','ssn-identity-verification','adverse-action-process',
        'pay-rate-hire-date','offer-prep','manager-approval','employee-agreement','i9-right-to-work-verification','offer-acceptance',
        'hr-final-approval','pre-hire-completion-milestone',
        'manager-welcome-call','welcome-packet-esign',
        'payroll-profile-creation','tax-forms','direct-deposit-setup','i9-section-2','benefits-enrollment','401k-enrollment',
        'system-access','badge-equipment-issuance','equipment-badge-acknowledgment','schedule-assignment','facility-access-setup','benefits-confirmation',
        'orientation-video','policy-acknowledgment','safety-training','training-modules-quiz','compliance-training','certification-upload','health-screening-waiver',
        'post-hire-completion-milestone'
      ]
    ),
    (
      'RnR Workflow (Healthcare Industry)',
      'RNR',
      'healthcare',
      'Healthcare recruit-and-release workflow.',
      ARRAY[
        'resume-basic-profile','parameterized-job-application','collect-extra-files','collect-references',
        'recruiter-screening','skill-qualification-assessment','reference-verification',
        'interview-qualification','internal-select',
        'oig-exclusion-check','credential-license-verification',
        'submit-to-msp','submit-to-client','manager-facility-approval','release-to-client',
        'record-selection'
      ]
    ),
    (
      'W2 Workflow (IT Industry)',
      'W2',
      'technology',
      'IT W2 employee workflow.',
      ARRAY[
        'resume-basic-profile','parameterized-job-application','collect-extra-files','collect-references',
        'recruiter-screening','skill-qualification-assessment','reference-verification',
        'interview-qualification','follow-up-interview','internal-select',
        'submit-to-msp','submit-to-client','manager-facility-approval',
        'authorization-esign','background-check','ssn-identity-verification','adverse-action-process',
        'pay-rate-hire-date','offer-prep','manager-approval','employee-agreement','i9-right-to-work-verification','offer-acceptance',
        'hr-final-approval','pre-hire-completion-milestone',
        'manager-welcome-call','welcome-packet-esign',
        'payroll-profile-creation','tax-forms','direct-deposit-setup','i9-section-2','benefits-enrollment','401k-enrollment',
        'system-access','badge-equipment-issuance','equipment-badge-acknowledgment','schedule-assignment','facility-access-setup','benefits-confirmation',
        'orientation-video','policy-acknowledgment','training-modules-quiz','compliance-training',
        'post-hire-completion-milestone'
      ]
    ),
    (
      'RnR Workflow (IT Industry)',
      'RNR',
      'technology',
      'IT recruit-and-release workflow.',
      ARRAY[
        'resume-basic-profile','parameterized-job-application','collect-extra-files','collect-references',
        'recruiter-screening','skill-qualification-assessment','reference-verification',
        'interview-qualification','internal-select',
        'submit-to-msp','submit-to-client','manager-facility-approval','release-to-client',
        'record-selection'
      ]
    );

  SELECT string_agg(DISTINCT needed.step_key, ', ' ORDER BY needed.step_key)
  INTO missing
  FROM (
    SELECT unnest(steps) AS step_key FROM desired_industry_templates
  ) AS needed
  LEFT JOIN public.onboarding_step_library AS library
    ON library.tenant_id IS NULL
   AND library.step_key = needed.step_key
   AND library.is_active = true
  WHERE library.step_key IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing step library keys: %', missing;
  END IF;

  DELETE FROM public.onboarding_templates
  WHERE type = 'preset'
    AND is_system_preset = true
    AND employment_type IN ('W2', '1099', 'RNR');

  FOR spec IN
    SELECT * FROM desired_industry_templates ORDER BY template_name
  LOOP
    SELECT jsonb_build_object(
      'nodes', COALESCE(jsonb_agg(node ORDER BY ordinality), '[]'::jsonb),
      'edges', '[]'::jsonb
    )
    INTO draft
    FROM (
      SELECT
        ordinality,
        jsonb_build_object(
          'id', lower(spec.employment_type) || '-' || spec.industry_key || '-' || lpad(ordinality::text, 2, '0'),
          'stepId', library.step_key,
          'label', library.title,
          'description', COALESCE(library.description, ''),
          'position', jsonb_build_object('x', 80, 'y', 80 + ((ordinality - 1) * 140)),
          'day', CASE
            WHEN COALESCE(
              CASE WHEN spec.employment_type = 'RNR' AND library.step_key = 'record-selection' THEN 'pre_hire' END,
              library.default_settings->>'phase',
              'pre_hire'
            ) = 'post_hire' THEN 2
            ELSE 1
          END,
          'required', true,
          'settings', jsonb_strip_nulls(jsonb_build_object(
            'phase', COALESCE(
              CASE WHEN spec.employment_type = 'RNR' AND library.step_key = 'record-selection' THEN 'pre_hire' END,
              library.default_settings->>'phase',
              'pre_hire'
            ),
            'phaseOrder', CASE COALESCE(
              CASE WHEN spec.employment_type = 'RNR' AND library.step_key = 'record-selection' THEN 'pre_hire' END,
              library.default_settings->>'phase',
              'pre_hire'
            )
              WHEN 'transition' THEN 2
              WHEN 'post_hire' THEN 3
              ELSE 1
            END,
            'stepOrder', ordinality,
            'stageName', library.default_settings->>'stageName',
            'completionOwner', COALESCE(library.default_settings->>'completionOwner', 'applicant')
          ))
        ) AS node
      FROM unnest(spec.steps) WITH ORDINALITY AS ordered(step_key, ordinality)
      JOIN public.onboarding_step_library AS library
        ON library.tenant_id IS NULL
       AND library.step_key = ordered.step_key
       AND library.is_active = true
    ) AS built;

    INSERT INTO public.onboarding_templates (
      tenant_id,
      name,
      description,
      type,
      status,
      flow_name,
      builder_draft,
      employment_type,
      industry_key,
      template_type,
      is_system_preset,
      is_editable,
      version
    )
    VALUES (
      NULL,
      spec.template_name,
      spec.description,
      'preset',
      'published',
      spec.template_name,
      draft,
      spec.employment_type,
      spec.industry_key,
      'default',
      true,
      false,
      1
    )
    RETURNING id INTO new_template_id;

    INSERT INTO public.onboarding_template_steps (
      template_id, step_type, title, description, position, day, is_required,
      phase, phase_order, step_order, is_conditional, unlock_condition, completion_owner,
      settings, metadata, canvas_node_id
    )
    SELECT
      new_template_id,
      node->>'stepId',
      node->>'label',
      NULLIF(node->>'description', ''),
      ordinality::integer,
      COALESCE((node->>'day')::integer, 1),
      COALESCE((node->>'required')::boolean, true),
      COALESCE(node->'settings'->>'phase', 'pre_hire'),
      COALESCE((node->'settings'->>'phaseOrder')::integer, 1),
      COALESCE((node->'settings'->>'stepOrder')::integer, ordinality::integer),
      false,
      NULL,
      NULLIF(node->'settings'->>'completionOwner', ''),
      COALESCE(node->'settings', '{}'::jsonb),
      jsonb_build_object('library_step_key', node->>'stepId'),
      node->>'id'
    FROM jsonb_array_elements(draft->'nodes') WITH ORDINALITY AS nodes(node, ordinality);
  END LOOP;
END $$;
