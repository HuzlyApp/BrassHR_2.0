-- Collect Extra Files runs during candidate onboarding, before employment conversion.
-- worker_extra_files.worker_id must reference public.worker (the applicant),
-- not public.workers (the payroll record created only after conversion).

ALTER TABLE public.worker_extra_files
  DROP CONSTRAINT IF EXISTS worker_extra_files_worker_id_fkey;

ALTER TABLE public.worker_extra_files
  ADD CONSTRAINT worker_extra_files_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES public.worker (id) ON DELETE CASCADE;
