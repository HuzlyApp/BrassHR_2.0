-- Add staff roles beside the existing recruiter role.
-- Recruiter memberships stay stored as app_role "client"; these values are only
-- available for new assignments and do not rewrite existing users or user_roles.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'recruiter';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';

CREATE OR REPLACE FUNCTION public.user_is_tenant_staff(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = p_tenant_id
      AND ur.role::text IN (
        'admin',
        'client',
        'recruiter',
        'hr',
        'manager',
        'finance',
        'support'
      )
      AND ur.is_active = true
      AND u.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.tenant_id = p_tenant_id
      AND u.role::text IN (
        'admin',
        'client',
        'recruiter',
        'hr',
        'manager',
        'finance',
        'support'
      )
      AND u.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = u.id
          AND ur.tenant_id = p_tenant_id
      )
  );
$function$;
