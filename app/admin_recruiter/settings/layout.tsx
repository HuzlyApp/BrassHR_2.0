import SettingsMobileNav from "@/app/admin_recruiter/settings/SettingsMobileNav";
import SettingsSidebar from "@/app/admin_recruiter/settings/SettingsSidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 items-start">
      <SettingsSidebar />
      <div className="min-w-0 flex-1 px-5 pb-8 pt-5 lg:px-6">
        <SettingsMobileNav />
        {children}
      </div>
    </div>
  );
}
