"use client";

import { useEffect, useState } from "react";
import AdminConsolePanel from "@/app/admin_recruiter/settings/AdminConsolePanel";
import AssessmentSettingsPanel from "@/app/admin_recruiter/settings/AssessmentSettingsPanel";
import BrandingSettingsPanel from "@/app/admin_recruiter/settings/BrandingSettingsPanel";
import CandidateStatusesPanel from "@/app/admin_recruiter/settings/CandidateStatusesPanel";
import ProfessionDocumentsPanel from "@/app/admin_recruiter/settings/ProfessionDocumentsPanel";
import RolePermissionsPanel from "@/app/admin_recruiter/settings/RolePermissionsPanel";
import SettingsSectionHeader from "@/app/admin_recruiter/settings/SettingsSectionHeader";
import TemplatesSettingsPanel from "@/app/admin_recruiter/settings/TemplatesSettingsPanel";
import {
  SETTINGS_SECTION_META,
  type SettingsSectionSlug,
} from "@/app/admin_recruiter/settings/settings-nav";

type SettingsSectionClientProps = {
  section: SettingsSectionSlug;
};

export default function SettingsSectionClient({ section }: SettingsSectionClientProps) {
  const meta = SETTINGS_SECTION_META[section];
  const [company, setCompany] = useState({ canEdit: false, canDelete: false });

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/access")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          grants?: Array<{ key: string; canEdit?: boolean; canDelete?: boolean }>;
        };
        const grant = body.grants?.find((item) => item.key === "settings_company");
        if (!cancelled && grant) {
          setCompany({ canEdit: grant.canEdit === true, canDelete: grant.canDelete === true });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const showPageHeader = section !== "branding" && section !== "hiring-theme";

  return (
    <div className="w-full min-w-0 space-y-6">
      {showPageHeader ? (
        <SettingsSectionHeader title={meta.title} description={meta.description} />
      ) : null}

      {section === "roles" ? (
        <RolePermissionsPanel canEdit={company.canEdit} canDelete={company.canDelete} />
      ) : section === "templates" ? (
        <TemplatesSettingsPanel />
      ) : (
        <fieldset disabled={!company.canEdit} className="min-w-0 space-y-6 border-0 p-0 disabled:opacity-80">
          {section === "branding" || section === "hiring-theme" ? (
            <BrandingSettingsPanel
              initialTab={section === "hiring-theme" ? "hiring-journey" : "logo"}
            />
          ) : null}
          {section === "admin-console" ? <AdminConsolePanel embedInSettingsPage /> : null}
          {section === "assessment" ? <AssessmentSettingsPanel /> : null}
          {section === "profession" ? <ProfessionDocumentsPanel /> : null}
          {section === "statuses" ? <CandidateStatusesPanel /> : null}
        </fieldset>
      )}
    </div>
  );
}
