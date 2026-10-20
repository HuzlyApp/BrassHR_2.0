-- Attribute resumes uploaded by staff via "Add candidate from resume" to that staff user.
-- Those rows were inserted without uploaded_by_user_id, so the staff drawer labelled them
-- as the applicant's upload. Only resumes created alongside a staff-created application
-- (within 15 minutes) are touched; applicant uploads keep a NULL uploader.

UPDATE public.worker_resumes wr
SET uploaded_by_user_id = ja.created_by_staff_user_id
FROM public.job_applications ja
WHERE wr.job_application_id = ja.id
  AND wr.tenant_id = ja.tenant_id
  AND wr.uploaded_by_user_id IS NULL
  AND ja.source = 'admin'
  AND ja.created_by_staff_user_id IS NOT NULL
  AND wr.uploaded_at BETWEEN ja.created_at - interval '15 minutes'
                         AND ja.created_at + interval '15 minutes';
