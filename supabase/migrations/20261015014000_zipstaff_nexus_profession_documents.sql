-- Reference seed for zipstaff (IT, Public Works) and nexus (Nursing).
-- Adapted to the live schema:
--   nexus slug is nexusmedpro
--   profession industry_key must equal the tenant's primary industry
--   catalog keys it and public_works are not in profession_catalog
--   workflow_required_documents has no doc_category column
-- Re-runnable. Does not delete existing rows.

INSERT INTO public.tenant_professions (tenant_id, industry_key, catalog_key, name, is_active)
SELECT t.id, t.primary_industry_key, NULL, v.name, true
FROM public.tenants t
JOIN (
  VALUES
    ('zipstaff'::text, 'IT'::text),
    ('zipstaff'::text, 'Public Works'::text)
) AS v(slug, name)
  ON t.slug = v.slug
WHERE t.primary_industry_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_professions p
    WHERE p.tenant_id = t.id
      AND lower(p.name) = lower(v.name)
  );

INSERT INTO public.onboarding_flows (
  tenant_id,
  profession_id,
  name,
  status,
  employment_type,
  builder_draft,
  created_as_blank
)
SELECT
  p.tenant_id,
  p.id,
  p.name || ' W2',
  'published',
  'W2',
  '{"nodes":[],"edges":[]}'::jsonb,
  false
FROM public.tenant_professions p
JOIN public.tenants t ON t.id = p.tenant_id
WHERE t.slug IN ('zipstaff', 'nexusmedpro')
  AND p.name IN ('IT', 'Public Works', 'Nursing')
  AND NOT EXISTS (
    SELECT 1
    FROM public.onboarding_flows f
    WHERE f.tenant_id = p.tenant_id
      AND f.profession_id = p.id
      AND f.employment_type = 'W2'
  );

INSERT INTO public.workflow_required_documents (
  tenant_id,
  flow_id,
  code,
  name,
  is_required,
  has_expiration,
  collect_issuing_organization,
  collect_scope,
  collect_validity,
  sort_order,
  is_active
)
SELECT
  f.tenant_id,
  f.id,
  d.code,
  d.name,
  d.is_required,
  d.has_expiration,
  d.collect_org,
  d.collect_scope,
  d.collect_validity,
  d.sort_order,
  true
FROM public.onboarding_flows f
JOIN public.tenant_professions p ON p.id = f.profession_id
JOIN public.tenants t ON t.id = f.tenant_id
JOIN (
  VALUES
    ('IT'::text, 'RESUME'::text, 'Resume'::text, true, false, false, false, false, 1),
    ('IT', 'SSN_CARD', 'SSN card', true, false, false, false, false, 2),
    ('IT', 'DRIVERS_LICENSE', 'Driver license', true, true, true, false, false, 3),
    ('Public Works', 'RESUME', 'Resume', true, false, false, false, false, 1),
    ('Public Works', 'SSN_CARD', 'SSN card', true, false, false, false, false, 2),
    ('Public Works', 'DRIVERS_LICENSE', 'Driver license', true, true, true, false, false, 3),
    ('Nursing', 'NURSING_LICENSE', 'Nursing License', true, false, false, false, false, 1),
    ('Nursing', 'CPR', 'CPR Certifications', true, false, false, false, false, 1),
    ('Nursing', 'BLS', 'BLS', true, true, true, false, true, 2),
    ('Nursing', 'ACLS', 'ACLS', false, true, true, false, true, 3),
    ('Nursing', 'RESUME', 'Upload Resume', true, false, false, false, false, 1),
    ('Nursing', 'TB_TEST', 'TB Test', true, false, false, false, false, 2)
) AS d(profession, code, name, is_required, has_expiration, collect_org, collect_scope, collect_validity, sort_order)
  ON d.profession = p.name
WHERE t.slug IN ('zipstaff', 'nexusmedpro')
  AND f.employment_type = 'W2'
  AND NOT EXISTS (
    SELECT 1
    FROM public.workflow_required_documents w
    WHERE w.flow_id = f.id
      AND w.code = d.code
  );

-- Settings documents only store certificate or license. Resume, SSN card, and TB Test
-- stay on the workflow list above. Existing Nursing settings rows are left unchanged.
INSERT INTO public.tenant_profession_documents (
  tenant_id,
  profession_id,
  name,
  document_kind,
  is_required,
  sort_order,
  is_active
)
SELECT
  p.tenant_id,
  p.id,
  d.name,
  d.document_kind,
  d.is_required,
  d.sort_order,
  true
FROM public.tenant_professions p
JOIN public.tenants t ON t.id = p.tenant_id
JOIN (
  VALUES
    ('IT'::text, 'Driver license'::text, 'license'::text, true, 30),
    ('Public Works', 'Driver license', 'license', true, 30)
) AS d(profession, name, document_kind, is_required, sort_order)
  ON d.profession = p.name
WHERE t.slug IN ('zipstaff', 'nexusmedpro')
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_profession_documents existing
    WHERE existing.profession_id = p.id
      AND existing.is_active = true
      AND lower(existing.name) = lower(d.name)
  );
