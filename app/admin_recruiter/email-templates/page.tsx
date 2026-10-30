import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import EmailTemplatesPanel from "@/app/admin_recruiter/components/EmailTemplatesPanel";

export default function AdminRecruiterEmailTemplatesPage() {
  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <Link
          href="/admin_recruiter/settings/templates"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] hover:underline mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Templates
        </Link>
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
