-- Worker Extra Files table for "Collect Extra Files" step
-- Stores optional additional documents uploaded by candidates

CREATE TABLE IF NOT EXISTS public.worker_extra_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.worker (id) ON DELETE CASCADE,
  original_file_name text NOT NULL,
  file_size_bytes bigint,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worker_extra_files_tenant_worker_idx
  ON public.worker_extra_files (tenant_id, worker_id);

CREATE INDEX IF NOT EXISTS worker_extra_files_storage_path_idx
  ON public.worker_extra_files (storage_path);

COMMENT ON TABLE public.worker_extra_files IS
  'Optional additional documents uploaded by candidates in the "Collect Extra Files" workflow step.';

COMMENT ON COLUMN public.worker_extra_files.original_file_name IS
  'The original filename as uploaded by the candidate.';

COMMENT ON COLUMN public.worker_extra_files.file_size_bytes IS
  'File size in bytes for display purposes.';

COMMENT ON COLUMN public.worker_extra_files.storage_path IS
  'Supabase storage path or public URL to the uploaded file.';

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_worker_extra_files_updated_at
  ON public.worker_extra_files;
CREATE TRIGGER set_worker_extra_files_updated_at
BEFORE UPDATE ON public.worker_extra_files
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS Policies
ALTER TABLE public.worker_extra_files ENABLE ROW LEVEL SECURITY;

-- Staff can manage all extra files in their tenant
DROP POLICY IF EXISTS worker_extra_files_staff ON public.worker_extra_files;
CREATE POLICY worker_extra_files_staff
  ON public.worker_extra_files
  FOR ALL TO authenticated
  USING (public.user_is_tenant_staff(tenant_id))
  WITH CHECK (public.user_is_tenant_staff(tenant_id));

-- Workers can read/write their own extra files
DROP POLICY IF EXISTS worker_extra_files_worker_own ON public.worker_extra_files;
CREATE POLICY worker_extra_files_worker_own
  ON public.worker_extra_files
  FOR ALL TO authenticated
  USING (public.approved_applicant_owns_worker(worker_id))
  WITH CHECK (public.approved_applicant_owns_worker(worker_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_extra_files TO authenticated;
GRANT ALL ON public.worker_extra_files TO service_role;
