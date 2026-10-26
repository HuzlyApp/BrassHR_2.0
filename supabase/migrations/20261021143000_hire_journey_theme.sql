-- Hiring Journey screen colors. Stored apart from tenant branding so
-- journey edits do not change primary or secondary branding.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS hire_journey_theme jsonb;

COMMENT ON COLUMN public.tenants.hire_journey_theme IS
  'Optional Hiring Journey color overrides. Missing keys fall back to branding and never write branding columns.';
