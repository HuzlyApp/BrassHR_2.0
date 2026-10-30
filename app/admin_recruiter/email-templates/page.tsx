import EmailTemplatesPanel from "@/app/admin_recruiter/components/EmailTemplatesPanel";

export default function AdminRecruiterEmailTemplatesPage() {
  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0F172A]">Email Templates</h1>
        <p className="mt-2 text-sm text-[#64748B]">
          Customize email content for your organization. Changes apply only to the current tenant
          and do not modify platform default templates.
        </p>
      </div>
      <EmailTemplatesPanel />
    </div>
  );
}
