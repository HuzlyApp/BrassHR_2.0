-- Replace the global Steps Library with the pre-hire / post-hire master list.
-- Existing step keys are renamed and regrouped. Keys that are not on the list are removed.
-- Published workflows keep their own step rows; this only changes the library catalog.

CREATE TEMP TABLE desired_master_steps (
  category_id text NOT NULL,
  category_label text NOT NULL,
  step_key text NOT NULL,
  step_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon_key text NOT NULL,
  sort_order integer NOT NULL,
  default_settings jsonb NOT NULL
);

INSERT INTO desired_master_steps (
  category_id, category_label, step_key, step_type, title, description, icon_key, sort_order, default_settings
) VALUES
  ('application-profile', 'Intake', 'resume-basic-profile', 'resume_upload', 'Resume and profile', 'Collect resume details and basic applicant profile information.', 'resume-basic-profile', 1, '{"phase":"pre_hire","stageName":"Intake"}'::jsonb),
  ('application-profile', 'Intake', 'parameterized-job-application', 'profile_information', 'Job application', 'Collect role-specific application details.', 'parameterized-job-application', 2, '{"phase":"pre_hire","stageName":"Intake"}'::jsonb),
  ('application-profile', 'Intake', 'collect-extra-files', 'document_upload', 'Collect documents', 'Request additional documents from the candidate during intake.', 'collect-extra-files', 3, '{"phase":"pre_hire","stageName":"Intake"}'::jsonb),
  ('application-profile', 'Intake', 'collect-references', 'references', 'Collect references', 'Ask the candidate to provide professional references.', 'collect-references', 4, '{"phase":"pre_hire","stageName":"Intake"}'::jsonb),
  ('application-profile', 'Intake', 'custom-form', 'custom_question', 'Custom form', 'Add a custom intake form for this workflow.', 'custom-form', 5, '{"phase":"pre_hire","stageName":"Intake"}'::jsonb),

  ('screening', 'Screening', 'recruiter-screening', 'custom_question', 'Recruiter screening', 'Recruiter screens the candidate before interview or client review.', 'recruiter-screening', 1, '{"phase":"pre_hire","stageName":"Screening"}'::jsonb),
  ('screening', 'Screening', 'skill-qualification-assessment', 'skill_assessment', 'Skill / qualification assessment', 'Assess applicant skills and qualifications.', 'skill-qualification-assessment', 2, '{"phase":"pre_hire","stageName":"Screening"}'::jsonb),
  ('screening', 'Screening', 'reference-verification', 'references', 'Reference check', 'Track reference verification.', 'reference-verification', 3, '{"phase":"pre_hire","stageName":"Screening"}'::jsonb),

  ('interview', 'Interview', 'interview-qualification', 'custom_question', 'Interview', 'Track the candidate interview.', 'interview-qualification', 1, '{"phase":"pre_hire","stageName":"Interview"}'::jsonb),
  ('interview', 'Interview', 'follow-up-interview', 'custom_question', 'Follow-up interview', 'Track a follow-up interview.', 'interview-qualification', 2, '{"phase":"pre_hire","stageName":"Interview"}'::jsonb),
  ('interview', 'Interview', 'internal-select', 'custom_question', 'Internal selection', 'Internally select the candidate to move forward.', 'internal-select', 3, '{"phase":"pre_hire","stageName":"Interview"}'::jsonb),

  ('submission', 'Submission', 'submit-to-msp', 'custom_question', 'Submit to MSP', 'Prepare the candidate profile and required packet, then submit the candidate to the MSP.', 'submit-to-msp', 1, '{"phase":"pre_hire","stageName":"Submission"}'::jsonb),
  ('submission', 'Submission', 'submit-to-client', 'custom_question', 'Submit to client', 'Submit the candidate to the client.', 'release-to-client', 2, '{"phase":"pre_hire","stageName":"Submission"}'::jsonb),
  ('submission', 'Submission', 'manager-facility-approval', 'custom_question', 'Client / facility approval', 'Request client or facility approval.', 'manager-facility-approval', 3, '{"phase":"pre_hire","stageName":"Submission"}'::jsonb),
  ('submission', 'Submission', 'release-to-client', 'custom_question', 'Released to client', 'Mark recruitment complete and hand the candidate off to the client for final hiring.', 'release-to-client', 4, '{"phase":"transition","stageName":"Submission"}'::jsonb),

  ('screening-compliance', 'Compliance', 'authorization-esign', 'authorizations', 'Authorization e-sign', 'Collect authorization e-sign signatures.', 'agreement-esign', 1, '{"phase":"pre_hire","stageName":"Compliance"}'::jsonb),
  ('screening-compliance', 'Compliance', 'background-check', 'custom_question', 'Background check', 'Track background check completion.', 'background-check', 2, '{"phase":"pre_hire","stageName":"Compliance"}'::jsonb),
  ('screening-compliance', 'Compliance', 'drug-test-screening', 'custom_question', 'Drug screen', 'Track drug screen requirements.', 'drug-test-screening', 3, '{"phase":"pre_hire","stageName":"Compliance"}'::jsonb),
  ('screening-compliance', 'Compliance', 'oig-exclusion-check', 'custom_question', 'OIG / exclusion check', 'Track OIG or exclusion screening.', 'oig-exclusion-check', 4, '{"phase":"pre_hire","stageName":"Compliance"}'::jsonb),
  ('screening-compliance', 'Compliance', 'credential-license-verification', 'professional_license', 'License and credential verification', 'Verify professional credentials and licenses.', 'credential-license-verification', 5, '{"phase":"pre_hire","stageName":"Compliance"}'::jsonb),
  ('screening-compliance', 'Compliance', 'ssn-identity-verification', 'document_upload', 'Identity verification', 'Collect identity verification documentation.', 'ssn-identity-verification', 6, '{"phase":"pre_hire","stageName":"Compliance"}'::jsonb),
  ('screening-compliance', 'Compliance', 'adverse-action-process', 'custom_question', 'Adverse action', 'Track adverse action steps when required.', 'adverse-action-process', 7, '{"phase":"pre_hire","stageName":"Compliance"}'::jsonb),

  ('offer-agreement', 'Offer and agreement', 'pay-rate-hire-date', 'profile_information', 'Pay and start date', 'Confirm pay rate and agreed start date.', 'pay-and-start-date', 1, '{"phase":"pre_hire","stageName":"Offer and agreement"}'::jsonb),
  ('offer-agreement', 'Offer and agreement', 'offer-prep', 'custom_question', 'Offer prep', 'Prepare the offer before it is sent.', 'offer-accepted', 2, '{"phase":"pre_hire","stageName":"Offer and agreement"}'::jsonb),
  ('offer-agreement', 'Offer and agreement', 'manager-approval', 'custom_question', 'Manager approval', 'Request manager approval of the offer.', 'manager-facility-approval', 3, '{"phase":"pre_hire","stageName":"Offer and agreement"}'::jsonb),
  ('offer-agreement', 'Offer and agreement', 'employee-agreement', 'authorizations', 'Agreement e-sign', 'Collect the signed employee agreement.', 'agreement-esign', 4, '{"phase":"pre_hire","stageName":"Offer and agreement"}'::jsonb),
  ('offer-agreement', 'Offer and agreement', 'i9-right-to-work-verification', 'document_upload', 'I-9 Section 1', 'Complete I-9 Section 1 for the candidate.', 'i9-section-1', 5, '{"phase":"pre_hire","stageName":"Offer and agreement"}'::jsonb),
  ('offer-agreement', 'Offer and agreement', 'offer-acceptance', 'custom_question', 'Offer accepted', 'Track offer acceptance from the candidate.', 'offer-accepted', 6, '{"phase":"pre_hire","stageName":"Offer and agreement"}'::jsonb),

  ('approval-decision', 'Approvals', 'hr-final-approval', 'custom_question', 'HR final approval', 'Request final HR approval before hire.', 'hr-final-approval', 1, '{"phase":"pre_hire","stageName":"Approvals"}'::jsonb),
  ('approval-decision', 'Approvals', 'pre-hire-completion-milestone', 'custom_question', 'Pre-hire complete', 'Shows the Pre-Hire completion screen after the candidate finishes the other Pre-Hire steps.', 'completion-milestone', 2, '{"phase":"pre_hire","stageName":"Approvals","completionOwner":"applicant"}'::jsonb),

  ('communication-notification', 'Welcome', 'manager-welcome-call', 'custom_question', 'Welcome call', 'Schedule or track a welcome call.', 'manager-welcome-call', 1, '{"phase":"post_hire","stageName":"Welcome"}'::jsonb),
  ('communication-notification', 'Welcome', 'welcome-packet-esign', 'authorizations', 'Welcome packet', 'Collect signed welcome packet acknowledgments.', 'welcome-packet-esign', 2, '{"phase":"post_hire","stageName":"Welcome"}'::jsonb),

  ('payroll-financial', 'Payroll and tax', 'payroll-profile-creation', 'profile_information', 'Payroll profile', 'Create the payroll profile checklist.', 'payroll-profile-creation', 1, '{"phase":"post_hire","stageName":"Payroll and tax"}'::jsonb),
  ('payroll-financial', 'Payroll and tax', 'tax-forms', 'document_upload', 'Tax forms', 'Collect payroll tax forms.', 'tax-forms', 2, '{"phase":"post_hire","stageName":"Payroll and tax"}'::jsonb),
  ('payroll-financial', 'Payroll and tax', 'w9', 'document_upload', 'W-9', 'Collect Form W-9.', 'tax-forms', 3, '{"phase":"post_hire","stageName":"Payroll and tax"}'::jsonb),
  ('payroll-financial', 'Payroll and tax', 'direct-deposit-setup', 'profile_information', 'Direct deposit', 'Collect direct deposit information.', 'direct-deposit-setup', 4, '{"phase":"post_hire","stageName":"Payroll and tax"}'::jsonb),
  ('payroll-financial', 'Payroll and tax', 'i9-section-2', 'document_upload', 'I-9 Section 2', 'Complete I-9 Section 2 / E-Verify for the new hire.', 'i9-section-2', 5, '{"phase":"post_hire","stageName":"Payroll and tax"}'::jsonb),
  ('payroll-financial', 'Payroll and tax', 'benefits-enrollment', 'profile_information', 'Benefits enrollment', 'Collect benefits enrollment choices.', 'benefits-enrollment', 6, '{"phase":"post_hire","stageName":"Payroll and tax"}'::jsonb),
  ('payroll-financial', 'Payroll and tax', '401k-enrollment', 'profile_information', 'Retirement enrollment', 'Collect retirement enrollment choices.', '401k-enrollment', 7, '{"phase":"post_hire","stageName":"Payroll and tax"}'::jsonb),

  ('team-operational', 'Access and systems', 'system-access', 'custom_question', 'System access', 'Set up system access for the new hire.', 'facility-access-setup', 1, '{"phase":"post_hire","stageName":"Access and systems"}'::jsonb),
  ('team-operational', 'Access and systems', 'badge-equipment-issuance', 'custom_question', 'Badge and equipment issued', 'Track badge or equipment issuance.', 'badge-equipment-issuance', 2, '{"phase":"post_hire","stageName":"Access and systems"}'::jsonb),
  ('team-operational', 'Access and systems', 'equipment-badge-acknowledgment', 'document_upload', 'Equipment acknowledgment', 'Track equipment acknowledgment.', 'equipment-badge-acknowledgment', 3, '{"phase":"post_hire","stageName":"Access and systems"}'::jsonb),
  ('team-operational', 'Access and systems', 'schedule-assignment', 'custom_question', 'Schedule assignment', 'Assign work schedule for the new hire.', 'schedule-assignment', 4, '{"phase":"post_hire","stageName":"Access and systems"}'::jsonb),
  ('team-operational', 'Access and systems', 'facility-access-setup', 'custom_question', 'Facility access', 'Set up facility access for the new hire.', 'facility-access-setup', 5, '{"phase":"post_hire","stageName":"Access and systems"}'::jsonb),
  ('team-operational', 'Access and systems', 'benefits-confirmation', 'custom_question', 'Benefits confirmation', 'Confirm benefits enrollment details.', 'benefits-confirmation', 6, '{"phase":"post_hire","stageName":"Access and systems"}'::jsonb),

  ('training-development', 'Training and policy', 'orientation-video', 'custom_question', 'Orientation', 'Assign orientation content.', 'orientation-video', 1, '{"phase":"post_hire","stageName":"Training and policy"}'::jsonb),
  ('training-development', 'Training and policy', 'policy-acknowledgment', 'authorizations', 'Handbook / policy acknowledgment', 'Collect handbook and policy acknowledgments.', 'policy-acknowledgment', 2, '{"phase":"post_hire","stageName":"Training and policy"}'::jsonb),
  ('training-development', 'Training and policy', 'safety-training', 'custom_question', 'Safety training', 'Assign safety training tasks.', 'safety-training', 3, '{"phase":"post_hire","stageName":"Training and policy"}'::jsonb),
  ('training-development', 'Training and policy', 'training-modules-quiz', 'skill_assessment', 'Job training', 'Assign job training modules.', 'training-modules-quiz', 4, '{"phase":"post_hire","stageName":"Training and policy"}'::jsonb),
  ('training-development', 'Training and policy', 'compliance-training', 'custom_question', 'Compliance training', 'Assign compliance training content.', 'compliance-training', 5, '{"phase":"post_hire","stageName":"Training and policy"}'::jsonb),
  ('training-development', 'Training and policy', 'certification-upload', 'professional_license', 'Certification renewal', 'Request certification renewal details.', 'certification-upload', 6, '{"phase":"post_hire","stageName":"Training and policy"}'::jsonb),
  ('training-development', 'Training and policy', 'health-screening-waiver', 'authorizations', 'Health screening waiver', 'Collect the health screening waiver.', 'compliance-training', 7, '{"phase":"post_hire","stageName":"Training and policy"}'::jsonb),

  ('completion', 'Completion', 'buddy-mentor-assignment', 'custom_question', 'Buddy / mentor', 'Assign a buddy or mentor to the new hire.', 'buddy-mentor-assignment', 1, '{"phase":"post_hire","stageName":"Completion"}'::jsonb),
  ('completion', 'Completion', 'record-selection', 'custom_question', 'Record selection', 'Record the hire selection.', 'hr-final-approval', 2, '{"phase":"post_hire","stageName":"Completion"}'::jsonb),
  ('completion', 'Completion', 'post-hire-completion-milestone', 'custom_question', 'Post-hire complete', 'Shows the Post-Hire completion screen after the candidate finishes the other Post-Hire steps.', 'completion-milestone', 3, '{"phase":"post_hire","stageName":"Completion","completionOwner":"applicant"}'::jsonb);

UPDATE public.onboarding_step_library AS lib
SET
  category_id = d.category_id,
  category_label = d.category_label,
  title = d.title,
  description = d.description,
  icon_key = d.icon_key,
  sort_order = d.sort_order,
  is_active = true,
  default_settings = COALESCE(lib.default_settings, '{}'::jsonb) || d.default_settings,
  updated_at = now()
FROM desired_master_steps AS d
WHERE lib.tenant_id IS NULL
  AND lib.step_key = d.step_key;

INSERT INTO public.onboarding_step_library (
  tenant_id,
  category_id,
  category_label,
  step_key,
  step_type,
  title,
  description,
  icon_key,
  sort_order,
  default_settings,
  is_active
)
SELECT
  NULL,
  d.category_id,
  d.category_label,
  d.step_key,
  d.step_type,
  d.title,
  d.description,
  d.icon_key,
  d.sort_order,
  d.default_settings,
  true
FROM desired_master_steps AS d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_step_library AS existing
  WHERE existing.tenant_id IS NULL
    AND existing.step_key = d.step_key
);

DELETE FROM public.onboarding_step_library AS lib
WHERE lib.tenant_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM desired_master_steps AS d
    WHERE d.step_key = lib.step_key
  );

DELETE FROM public.onboarding_step_library AS extra
WHERE extra.tenant_id IS NULL
  AND extra.id <> (
    SELECT keeper.id
    FROM public.onboarding_step_library AS keeper
    WHERE keeper.tenant_id IS NULL
      AND keeper.step_key = extra.step_key
    ORDER BY keeper.updated_at DESC, keeper.id
    LIMIT 1
  );

DROP TABLE desired_master_steps;
