-- Store Steps Library group order on the catalog rows.
-- The builder sorts categories by default_settings.categoryOrder.

UPDATE public.onboarding_step_library AS library
SET default_settings = COALESCE(library.default_settings, '{}'::jsonb)
  || jsonb_build_object('categoryOrder', ordered.category_order)
FROM (
  VALUES
    ('application-profile', 1),
    ('screening', 2),
    ('interview', 3),
    ('submission', 4),
    ('screening-compliance', 5),
    ('offer-agreement', 6),
    ('approval-decision', 7),
    ('communication-notification', 8),
    ('payroll-financial', 9),
    ('team-operational', 10),
    ('training-development', 11),
    ('completion', 12)
) AS ordered(category_id, category_order)
WHERE library.tenant_id IS NULL
  AND library.category_id = ordered.category_id;
