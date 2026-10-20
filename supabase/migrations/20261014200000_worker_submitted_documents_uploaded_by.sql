-- Track who uploaded each required document so staff can upload on the candidate's behalf
-- and the step drawer can show "Name (Recruiter)" vs "Name (Applicant)".

alter table public.worker_submitted_documents
  add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null;

comment on column public.worker_submitted_documents.uploaded_by_user_id is
  'Staff user who uploaded the file for the candidate; null when the candidate uploaded it.';

-- Staff uploads have always been stored under <tenant>/<worker>/admin/<staff user id>/...
update public.worker_submitted_documents d
set uploaded_by_user_id = u.id
from auth.users u
where d.uploaded_by_user_id is null
  and u.id::text = substring(
    d.file_url
    from '/admin/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
  );
