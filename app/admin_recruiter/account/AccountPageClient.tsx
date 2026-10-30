"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import { isLimitedStaffConsoleRole } from "@/lib/admin/staff-directory-types";
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
  const isLimitedStaff = isLimitedStaffConsoleRole(profile?.role, profile?.is_admin);
  const hideTab = isRecruiterHiddenAccountTab(activeTab) && (loading || isLimitedStaff);

  useEffect(() => {
    if (loading || !isLimitedStaff || !isRecruiterHiddenAccountTab(activeTab)) return;
    router.replace(accountTabHref("personal"));
  }, [activeTab, isLimitedStaff, loading, router]);

  return (
    <div className="w-full min-w-0 space-y-6">

      <AccountTabNav activeTab={activeTab} />

        {activeTab === "personal" ? <PersonalTab /> : null}
        {!hideTab && activeTab === "business-info" ? <BusinessInfoTab /> : null}
        {!hideTab && activeTab === "account-settings" ? <AccountSettingsTab /> : null}
        {activeTab === "security" ? <SecurityTab /> : null}

    </div>
  );
}
