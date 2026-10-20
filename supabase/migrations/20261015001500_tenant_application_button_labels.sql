-- One follow-up button name and one close button name per tenant.
-- Null keeps "Follow Up needed" and "Close Application" on every stage.

CREATE TABLE IF NOT EXISTS public.application_status_button_labels (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  alternate_label text,
  closed_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_button_labels_alternate_chk CHECK (
    alternate_label IS NULL
    OR char_length(btrim(alternate_label)) BETWEEN 1 AND 60
  ),
  CONSTRAINT application_status_button_labels_closed_chk CHECK (
    closed_label IS NULL
    OR char_length(btrim(closed_label)) BETWEEN 1 AND 60
  )
);

DROP TRIGGER IF EXISTS set_application_status_button_labels_updated_at
  ON public.application_status_button_labels;
CREATE TRIGGER set_application_status_button_labels_updated_at
BEFORE UPDATE ON public.application_status_button_labels
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_button_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_button_labels_staff_select
  ON public.application_status_button_labels;
CREATE POLICY application_status_button_labels_staff_select
  ON public.application_status_button_labels
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_button_labels_admin_write
  ON public.application_status_button_labels;
CREATE POLICY application_status_button_labels_admin_write
  ON public.application_status_button_labels
  FOR ALL TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_button_labels TO authenticated;
GRANT ALL ON public.application_status_button_labels TO service_role;

NOTIFY pgrst, 'reload schema';
