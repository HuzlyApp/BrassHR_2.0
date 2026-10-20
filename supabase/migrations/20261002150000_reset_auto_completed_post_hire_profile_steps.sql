-- Post-Hire profile steps (Direct Deposit, Benefits, 401(k), Pay Rate, Payroll Profile) were
-- auto-completed as "no applicant screen" placeholders when they routed to the resume flow.
-- They now have their own screen, so reopen rows the system completed without a candidate answer.
update public.worker_onboarding_step_progress sp
set
  status = 'pending',
  completed_at = null,
  data = coalesce(sp.data, '{}'::jsonb) - 'system_completed' - 'reason' - 'upgraded_from',
  updated_at = now()
from public.tenant_onboarding_steps s
where s.id = sp.onboarding_step_id
  and sp.status = 'completed'
  and sp.data ->> 'system_completed' = 'true'
  and sp.data ->> 'reason' like 'non_navigable_placeholder%'
  and s.metadata ->> 'workflow_step_id' in (
    'direct-deposit-setup',
    'benefits-enrollment',
    '401k-enrollment',
    'pay-rate-hire-date',
    'payroll-profile-creation'
  );
