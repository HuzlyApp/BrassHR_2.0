"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AdminConsolePanel from "@/app/admin_recruiter/settings/AdminConsolePanel";
import BrandingSettingsPanel from "@/app/admin_recruiter/settings/BrandingSettingsPanel";
import CandidateStatusesPanel from "@/app/admin_recruiter/settings/CandidateStatusesPanel";
import AssessmentSettingsPanel from "@/app/admin_recruiter/settings/AssessmentSettingsPanel";
import ProfessionDocumentsPanel from "@/app/admin_recruiter/settings/ProfessionDocumentsPanel";

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyTab = searchParams.get("tab");

  useEffect(() => {
    if (legacyTab) {
      router.replace("/admin_recruiter/settings");
    }
  }, [legacyTab, router]);

  return (
    <main className="w-full min-w-0 max-w-full space-y-6 px-5 pb-8 pt-5 lg:px-8">
      <div>
        <h1 className="font-[Inter,sans-serif] text-[22px] font-semibold leading-8 tracking-tight text-[#012352]">
          Settings
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#64748B]">
          Set up onboarding, assessments, upload documents, and your company look. Branding updates apply for your
          whole organization, including worker sign-in.
        </p>
      </div>

      <section aria-labelledby="admin-console-heading">
        <h2 id="admin-console-heading" className="sr-only">
          Admin Console
        </h2>
        <AdminConsolePanel />
      </section>

      <section aria-labelledby="branding-heading">
        <h2 id="branding-heading" className="sr-only">
          Branding
        </h2>
        <BrandingSettingsPanel />
      </section>

      <section aria-labelledby="assessment-heading">
        <h2 id="assessment-heading" className="sr-only">
          Assessment
        </h2>
        <AssessmentSettingsPanel />
      </section>

      <section aria-labelledby="profession-documents-heading">
        <h2 id="profession-documents-heading" className="sr-only">
          Upload documents
        </h2>
        <ProfessionDocumentsPanel />
      </section>

      <section aria-labelledby="prehire-status-catalog-heading">
        <h2 id="prehire-status-catalog-heading" className="sr-only">
          Status catalog
        </h2>
        <CandidateStatusesPanel />
      </section>

    </main>
  );
}

export default function SettingsPageClient() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}
