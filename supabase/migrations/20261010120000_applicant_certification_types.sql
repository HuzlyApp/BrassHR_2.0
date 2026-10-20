-- Allow BLS, ACLS, and a named Other Certification on applicant license records.

ALTER TABLE public.worker_license_records
  ADD COLUMN IF NOT EXISTS certification_name text;

COMMENT ON COLUMN public.worker_license_records.certification_name IS
  'Name entered when license_type is other_certification.';

ALTER TABLE public.worker_license_records
  DROP CONSTRAINT IF EXISTS worker_license_records_type_chk;

ALTER TABLE public.worker_license_records
  ADD CONSTRAINT worker_license_records_type_chk
  CHECK (
    license_type IN (
      'nursing_license',
      'drivers_license',
      'cpr_certification',
      'bls_certification',
      'acls_certification',
      'tb_test',
      'other',
      'other_certification'
    )
  );
