-- Copy the Zipstaff status catalog onto a database that does not have that tenant yet.
-- Schema for these tables is already in place. This migration adds the tenant row
-- and the status, lane, reason-code, button, and stage-assignment rows.
-- Candidate applications and status history are not copied.
-- On production Zipstaff already exists, so the inserts match existing ids and update in place.
-- Other tenants are left as they are. Candidate rows are not copied.

INSERT INTO public.tenants (
  id, name, slug, subdomain, is_active, plan, primary_color, secondary_color,
  accent_color, account_access, hq_in_hold, primary_industry_key
)
VALUES (
  'efe85d96-536e-497b-9e1a-d8876d29feea',
  'Zipstaff',
  'zipstaff',
  'zipstaff',
  true,
  'starter',
  '#EB505B',
  '#14192F',
  '#EB505B',
  'active_trial',
  false,
  'technology'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.application_statuses (
  id, tenant_id, name, color, sort_order, is_active, is_default, system_key, button_lane
)
VALUES
  ('eae614cc-e866-4bca-a543-23abd146feea', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Reviewing', NULL, 0, true, false, 'reviewing', NULL),
  ('53dcc213-a367-4f35-9b2b-01f7383b9790', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Shortlisted', NULL, 1, true, false, 'shortlisted', NULL),
  ('86cb3213-b8a4-4391-b76e-ddd9c148aba0', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Interviewing', NULL, 2, true, false, 'interviewing', NULL),
  ('0ba9dd54-a7c0-4211-a399-eea371298cd8', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Undecided', NULL, 3, true, false, 'undecided', NULL),
  ('05a7c934-a36e-40e9-bba2-6b2ebbb0128c', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Interview Scheduled', NULL, 5, true, false, NULL, NULL),
  ('52f9fc4e-0957-4dca-8f52-6010c926769d', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Profile Ready', NULL, 7, true, false, NULL, NULL),
  ('43e9a413-f4e6-4520-8295-39ef9e6688e8', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Presented to Client', NULL, 9, true, false, NULL, NULL),
  ('e5bffeb3-13d0-4c73-8cbf-a2e2fd056eef', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'New / Not Contacted', '#9ca3af', 10, true, true, 'new', NULL),
  ('88665090-a4ac-47c4-a3b0-01872788f700', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Selected', NULL, 10, true, false, NULL, NULL),
  ('9aaa839a-9051-41d4-a866-3860087012fd', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Rejected After Interview', NULL, 16, true, false, NULL, NULL),
  ('d377ae6d-0f35-4b70-9d2c-dbc1e40d5ac6', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Rejected by MSP', NULL, 17, true, false, NULL, NULL),
  ('d4b9da85-b4f6-48a7-be92-ffd2cf227819', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Rejected by Client', NULL, 18, true, false, NULL, NULL),
  ('5c98aa9c-1837-4ab7-8d71-666674832dd6', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Attempted Contact', '#7dd3fc', 20, true, false, NULL, NULL),
  ('383936aa-bf9f-43a7-8931-90de1e9c9030', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Test Status', NULL, 23, true, false, NULL, NULL),
  ('451947ab-ed96-4218-8104-2d2d537f8e71', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Unreachable', '#d4a574', 30, true, false, NULL, NULL),
  ('424e760f-e5fd-4cce-9bfb-80b2b69f8749', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Initial Screening Complete', '#60a5fa', 40, true, false, NULL, NULL),
  ('d69d76b9-e0b4-4b7e-98e7-2f8df7be74e4', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Qualified-Ready for 2nd Interview', '#c4b5fd', 50, true, false, NULL, NULL),
  ('a1a8c1d9-3bfb-4826-8548-c77ed471a5d9', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Approved -Upload to Portal', '#94a3b8', 60, true, false, NULL, NULL),
  ('95db4e13-3891-45df-bdce-3078e994708b', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Disqualified / Not a Fit', '#fca5a5', 70, true, false, NULL, NULL),
  ('f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Follow-up Needed', '#fbbf24', 80, true, false, NULL, 'alternate'),
  ('8daa0d28-8dee-4288-9e6b-89a8e8a645dd', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Candidate Withdrew', '#f9a8d4', 90, true, false, 'withdrawn', NULL),
  ('3f7a0322-0ebe-447b-be7a-b908e1ab731f', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Profile Uploaded', '#bae6fd', 100, true, false, NULL, NULL),
  ('90240b8a-7422-44ad-82c2-953392e159a7', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Candidate selected', '#166534', 110, true, false, 'hired', NULL),
  ('991ef894-a523-478d-9030-8feb9cced464', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Candidate Rejected', '#d1d5db', 120, true, false, 'rejected', NULL),
  ('7c717e82-d85f-4638-9d95-a6684fd02841', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Callback - not available', '#5b21b6', 130, true, false, NULL, NULL),
  ('0f729966-4615-4588-9ba2-3d67510aa28c', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Rejected After 2nd Interview', '#991b1b', 140, true, false, NULL, NULL),
  ('8c27a078-b5ee-4b32-8f1c-1815eed0d94d', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Fit for future Roles', '#64748b', 150, true, false, 'archived', NULL),
  ('f22e7c2e-cdb7-4dd3-af67-be90a7d0ce0d', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Submitted for MSP Review', '#9c9940', 160, true, false, NULL, NULL),
  ('aee365a2-e9f2-485e-808a-727af67504be', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Approved by MSP', '#539a18', 170, true, false, NULL, NULL),
  ('e3666af7-a562-4078-bcd7-ea4fcbf1c9a0', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Selected by MSP Client', '#0f9990', 180, true, false, NULL, NULL),
  ('39f9c6c4-ff02-4498-9ac0-655cf624d5c2', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Rejected at MSP Screening', '#c7381f', 190, true, false, NULL, NULL),
  ('bf7d58dc-2571-4c05-ba73-e6d0effd73a9', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'New/ Applied', NULL, 191, true, false, NULL, NULL),
  ('9302a270-ce52-4b7c-bd67-a5391de230c3', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Resume Verified', NULL, 192, true, false, NULL, NULL),
  ('a2e12f00-a792-4b41-a5eb-62ea5b4c00e6', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Documents Verified', NULL, 193, true, false, NULL, NULL),
  ('6c33cd61-01f0-4243-ba1d-e0a8e48a627d', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Application Closed', NULL, 194, true, false, NULL, NULL),
  ('6294aa3d-dabd-42ab-a4a3-31fae9ca3848', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Screening Complete', NULL, 195, true, false, NULL, NULL),
  ('9aea8408-450b-483d-9f66-8ce6ba4b014f', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Qualified', NULL, 196, true, false, NULL, NULL),
  ('d1a60db9-0370-4b4b-a3c7-8c5506365057', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Submitted to MSP', NULL, 197, true, false, NULL, NULL),
  ('993b328a-5171-4c79-92ee-90959dd6943b', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'MSP Approved', NULL, 198, true, false, NULL, NULL),
  ('2eda5128-cd5e-47f6-914c-683602a089e0', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Submitted to Client', NULL, 199, true, false, NULL, NULL),
  ('ea3ee75a-f498-41f9-b691-217c1523283e', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Client Approved', NULL, 200, true, false, NULL, NULL),
  ('0204b245-25b6-4087-b37a-d8b67784b701', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Verification Complete', NULL, 201, true, false, NULL, NULL),
  ('5a126a3a-bb81-4375-89dd-54e44c222cc6', 'efe85d96-536e-497b-9e1a-d8876d29feea', 'Offer Accepted', NULL, 202, true, false, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default,
  system_key = EXCLUDED.system_key,
  button_lane = EXCLUDED.button_lane,
  group_id = NULL;

INSERT INTO public.application_status_stage_lanes (
  tenant_id, stage_name, status_id, lane, sort_order, workflow_id
)
SELECT
  'efe85d96-536e-497b-9e1a-d8876d29feea',
  seed.stage_name,
  seed.status_id,
  seed.lane,
  seed.sort_order,
  NULL
FROM (
  VALUES
    ('Compliance', '0204b245-25b6-4087-b37a-d8b67784b701'::uuid, 'happy_path', 0),
    ('Compliance', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Compliance', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Intake', 'bf7d58dc-2571-4c05-ba73-e6d0effd73a9'::uuid, 'happy_path', 0),
    ('Intake', '9302a270-ce52-4b7c-bd67-a5391de230c3'::uuid, 'happy_path', 1),
    ('Intake', 'a2e12f00-a792-4b41-a5eb-62ea5b4c00e6'::uuid, 'happy_path', 2),
    ('Intake', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Interview', '05a7c934-a36e-40e9-bba2-6b2ebbb0128c'::uuid, 'happy_path', 0),
    ('Interview', '9aea8408-450b-483d-9f66-8ce6ba4b014f'::uuid, 'happy_path', 1),
    ('Interview', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Interview', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Offer & Agreement', '5a126a3a-bb81-4375-89dd-54e44c222cc6'::uuid, 'happy_path', 0),
    ('Offer & Agreement', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Offer & Agreement', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Screening', '5c98aa9c-1837-4ab7-8d71-666674832dd6'::uuid, 'happy_path', 0),
    ('Screening', '6294aa3d-dabd-42ab-a4a3-31fae9ca3848'::uuid, 'happy_path', 1),
    ('Screening', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Screening', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Submission', 'd1a60db9-0370-4b4b-a3c7-8c5506365057'::uuid, 'happy_path', 0),
    ('Submission', '993b328a-5171-4c79-92ee-90959dd6943b'::uuid, 'happy_path', 1),
    ('Submission', '2eda5128-cd5e-47f6-914c-683602a089e0'::uuid, 'happy_path', 2),
    ('Submission', 'ea3ee75a-f498-41f9-b691-217c1523283e'::uuid, 'happy_path', 3),
    ('Submission', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Submission', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Step 1 · Quick Match', 'bf7d58dc-2571-4c05-ba73-e6d0effd73a9'::uuid, 'happy_path', 0),
    ('Step 1 · Quick Match', '9302a270-ce52-4b7c-bd67-a5391de230c3'::uuid, 'happy_path', 1),
    ('Step 1 · Quick Match', 'a2e12f00-a792-4b41-a5eb-62ea5b4c00e6'::uuid, 'happy_path', 2),
    ('Step 1 · Quick Match', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Step 2 · Verifications', '5c98aa9c-1837-4ab7-8d71-666674832dd6'::uuid, 'happy_path', 0),
    ('Step 2 · Verifications', '6294aa3d-dabd-42ab-a4a3-31fae9ca3848'::uuid, 'happy_path', 1),
    ('Step 2 · Verifications', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Step 2 · Verifications', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Step 3 · Follow-Up', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Step 3 · Follow-Up', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Step 4 · Deep Match', '9aea8408-450b-483d-9f66-8ce6ba4b014f'::uuid, 'happy_path', 0),
    ('Step 4 · Deep Match', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0),
    ('Step 5 · Submission', 'd1a60db9-0370-4b4b-a3c7-8c5506365057'::uuid, 'happy_path', 0),
    ('Step 5 · Submission', '993b328a-5171-4c79-92ee-90959dd6943b'::uuid, 'happy_path', 1),
    ('Step 5 · Submission', '2eda5128-cd5e-47f6-914c-683602a089e0'::uuid, 'happy_path', 2),
    ('Step 5 · Submission', 'ea3ee75a-f498-41f9-b691-217c1523283e'::uuid, 'happy_path', 3),
    ('Step 5 · Submission', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 'alternate', 0),
    ('Step 5 · Submission', '6c33cd61-01f0-4243-ba1d-e0a8e48a627d'::uuid, 'closed', 0)
) AS seed(stage_name, status_id, lane, sort_order)
ON CONFLICT (tenant_id, stage_name, status_id) WHERE workflow_id IS NULL
DO UPDATE SET
  lane = EXCLUDED.lane,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.application_status_stage_reason_codes (
  tenant_id, stage_name, code, sort_order, workflow_id, note
)
SELECT
  'efe85d96-536e-497b-9e1a-d8876d29feea',
  seed.stage_name,
  seed.code,
  seed.sort_order,
  NULL,
  seed.note
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
  WHERE existing.tenant_id = 'efe85d96-536e-497b-9e1a-d8876d29feea'
    AND existing.workflow_id IS NULL
    AND existing.stage_name = seed.stage_name
    AND lower(btrim(existing.code)) = lower(btrim(seed.code))
);

UPDATE public.application_status_stage_reason_codes
SET note = 'This stage is before the candidate is contacted, only based on the resume and documents submitted.'
WHERE tenant_id = 'efe85d96-536e-497b-9e1a-d8876d29feea'
  AND workflow_id IS NULL
  AND stage_name IN ('Intake', 'Step 1 · Quick Match')
  AND lower(btrim(code)) = 'not a fit'
  AND note IS DISTINCT FROM 'This stage is before the candidate is contacted, only based on the resume and documents submitted.';

INSERT INTO public.application_status_stage_buttons (
  tenant_id, stage_name, workflow_id, show_alternate, show_closed
)
SELECT
  'efe85d96-536e-497b-9e1a-d8876d29feea',
  seed.stage_name,
  NULL,
  seed.show_alternate,
  true
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

INSERT INTO public.application_status_stage_assignments (
  tenant_id, stage_name, status_id, sort_order
)
SELECT
  'efe85d96-536e-497b-9e1a-d8876d29feea',
  seed.stage_name,
  seed.status_id,
  seed.sort_order
FROM (
  VALUES
    ('Approvals', '90240b8a-7422-44ad-82c2-953392e159a7'::uuid, 110),
    ('Approvals', 'e3666af7-a562-4078-bcd7-ea4fcbf1c9a0'::uuid, 180),
    ('Intake', 'e5bffeb3-13d0-4c73-8cbf-a2e2fd056eef'::uuid, 10),
    ('Intake', '5c98aa9c-1837-4ab7-8d71-666674832dd6'::uuid, 20),
    ('Intake', '451947ab-ed96-4218-8104-2d2d537f8e71'::uuid, 30),
    ('Intake', 'f1f0a0bf-3764-4aef-b637-f5bcb6e3c7c8'::uuid, 80),
    ('Intake', '7c717e82-d85f-4638-9d95-a6684fd02841'::uuid, 130),
    ('Interview', '53dcc213-a367-4f35-9b2b-01f7383b9790'::uuid, 1),
    ('Interview', '86cb3213-b8a4-4391-b76e-ddd9c148aba0'::uuid, 2),
    ('Interview', '05a7c934-a36e-40e9-bba2-6b2ebbb0128c'::uuid, 5),
    ('Interview', 'd69d76b9-e0b4-4b7e-98e7-2f8df7be74e4'::uuid, 50),
    ('Offer & Agreement', '88665090-a4ac-47c4-a3b0-01872788f700'::uuid, 10),
    ('Screening', 'eae614cc-e866-4bca-a543-23abd146feea'::uuid, 0),
    ('Screening', '424e760f-e5fd-4cce-9bfb-80b2b69f8749'::uuid, 40),
    ('Submission', '52f9fc4e-0957-4dca-8f52-6010c926769d'::uuid, 7),
    ('Submission', '43e9a413-f4e6-4520-8295-39ef9e6688e8'::uuid, 9),
    ('Submission', '3f7a0322-0ebe-447b-be7a-b908e1ab731f'::uuid, 100),
    ('Submission', 'f22e7c2e-cdb7-4dd3-af67-be90a7d0ce0d'::uuid, 160),
    ('Submission', 'aee365a2-e9f2-485e-808a-727af67504be'::uuid, 170)
) AS seed(stage_name, status_id, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.application_status_stage_assignments existing
  WHERE existing.tenant_id = 'efe85d96-536e-497b-9e1a-d8876d29feea'
    AND (
      existing.status_id = seed.status_id
      OR (existing.stage_name = seed.stage_name AND existing.status_id = seed.status_id)
    )
);

NOTIFY pgrst, 'reload schema';
