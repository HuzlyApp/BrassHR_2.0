-- Staff read policies only apply to signed-in users (Supabase advisor 0012: anonymous access policies).
ALTER POLICY applicant_workflow_step_events_staff_select
  ON public.applicant_workflow_step_events
  TO authenticated;

ALTER POLICY compliance_checks_staff_select
  ON public.compliance_checks
  TO authenticated;

ALTER POLICY facility_approvals_staff_select
  ON public.facility_approvals
  TO authenticated;
