-- Direct deposit details captured by the Post-Hire "Direct Deposit Setup" candidate screen.
--
-- One active account per worker per tenant. The account number is AES-256-GCM encrypted by the
-- app server (PAYROLL_DATA_ENCRYPTION_KEY) before insert; only the last four digits are stored in
-- clear. Reads and writes go through the server with the service role, so no client role gets
-- table access.

CREATE TABLE IF NOT EXISTS public.worker_direct_deposit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.worker (id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.job_applications (id) ON DELETE SET NULL,
  onboarding_step_id uuid,
  account_holder_name text NOT NULL CHECK (char_length(account_holder_name) BETWEEN 1 AND 120),
  bank_name text NOT NULL CHECK (char_length(bank_name) BETWEEN 1 AND 120),
  account_type text NOT NULL CHECK (account_type IN ('checking', 'savings')),
  routing_number text NOT NULL CHECK (routing_number ~ '^[0-9]{9}$'),
  account_number_encrypted text NOT NULL CHECK (account_number_encrypted LIKE 'v1:%'),
  account_last4 text NOT NULL CHECK (account_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_direct_deposit_accounts_tenant_worker_key UNIQUE (tenant_id, worker_id)
);

CREATE INDEX IF NOT EXISTS worker_direct_deposit_accounts_worker_idx
  ON public.worker_direct_deposit_accounts (worker_id);
CREATE INDEX IF NOT EXISTS worker_direct_deposit_accounts_application_idx
  ON public.worker_direct_deposit_accounts (application_id) WHERE application_id IS NOT NULL;

COMMENT ON TABLE public.worker_direct_deposit_accounts IS
  'Payroll direct deposit account per worker per tenant. account_number_encrypted is app-encrypted (AES-256-GCM).';

DROP TRIGGER IF EXISTS trg_worker_direct_deposit_accounts_updated_at ON public.worker_direct_deposit_accounts;
CREATE TRIGGER trg_worker_direct_deposit_accounts_updated_at
  BEFORE UPDATE ON public.worker_direct_deposit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.worker_direct_deposit_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.worker_direct_deposit_accounts FROM PUBLIC, anon, authenticated;
