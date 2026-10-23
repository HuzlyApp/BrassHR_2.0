"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import { appRoleToConsoleRole } from "@/lib/admin/staff-directory-types";
import AccountTabNav from "./components/AccountTabNav";
import PersonalTab from "./components/PersonalTab";
import BusinessInfoTab from "./components/BusinessInfoTab";
import SecurityTab from "./components/SecurityTab";
import AccountSettingsTab from "./components/AccountSettingsTab";
import { accountTabHref, isRecruiterHiddenAccountTab, type AccountTabSlug } from "./account-tabs";

type AccountPageClientProps = {
  activeTab: AccountTabSlug;
};

export default function AccountPageClient({ activeTab }: AccountPageClientProps) {
  const router = useRouter();
  const { profile, loading } = useAccountData();
  const isRecruiter = appRoleToConsoleRole(profile?.role) === "recruiter";
  const hideTab = isRecruiterHiddenAccountTab(activeTab) && (loading || isRecruiter);

  useEffect(() => {
    if (loading || !isRecruiter || !isRecruiterHiddenAccountTab(activeTab)) return;
    router.replace(accountTabHref("personal"));
  }, [activeTab, isRecruiter, loading, router]);

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1200px]">
        <AccountTabNav activeTab={activeTab} />

        {activeTab === "personal" ? <PersonalTab /> : null}
        {!hideTab && activeTab === "business-info" ? <BusinessInfoTab /> : null}
        {!hideTab && activeTab === "account-settings" ? <AccountSettingsTab /> : null}
        {activeTab === "security" ? <SecurityTab /> : null}
      </div>
    </main>
  );
}
