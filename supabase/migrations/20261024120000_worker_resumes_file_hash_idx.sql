-- Same-file resume lookups. The column already exists in production; keep other environments in sync.
ALTER TABLE public.worker_resumes
  ADD COLUMN IF NOT EXISTS file_hash text;

COMMENT ON COLUMN public.worker_resumes.file_hash IS
  'SHA-256 of the resume bytes. Skips repeat extraction and AI parsing for an unchanged file within the same tenant and worker.';

CREATE INDEX IF NOT EXISTS worker_resumes_tenant_worker_file_hash_idx
  ON public.worker_resumes (tenant_id, worker_id, file_hash)
  WHERE deleted_at IS NULL AND file_hash IS NOT NULL;
