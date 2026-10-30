import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RecruiterTemplatesList from "@/app/admin_recruiter/components/RecruiterTemplatesList";

export default function AdminRecruiterTemplateBuilderPage() {
  return (
    <div className="w-full min-w-0 space-y-4">
      <div>
        <Link
          href="/admin_recruiter/settings/templates"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Templates
        </Link>
      </div>
      <RecruiterTemplatesList />
    </div>
  );
}
