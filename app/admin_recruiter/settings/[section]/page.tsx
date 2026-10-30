import { notFound, redirect } from "next/navigation";
import SettingsSectionClient from "@/app/admin_recruiter/settings/SettingsSectionClient";
import {
  SETTINGS_SECTION_SLUGS,
  isSettingsSectionSlug,
  type SettingsSectionSlug,
} from "@/app/admin_recruiter/settings/settings-nav";

type PageProps = {
  params: Promise<{ section: string }>;
};

export function generateStaticParams() {
  return SETTINGS_SECTION_SLUGS.map((section) => ({ section }));
}

export default async function SettingsSectionPage({ params }: PageProps) {
  const { section } = await params;
  if (section === "company") {
    redirect("/admin_recruiter/settings/branding");
  }
  if (section === "reports" || section === "report") {
    redirect("/admin_recruiter/reports");
  }
  if (section === "help" || section === "help-support") {
    redirect("/admin_recruiter/help-support");
  }
  if (section === "notifications") {
    redirect("/admin_recruiter/notifications");
  }
  if (section === "template-builder") {
    redirect("/admin_recruiter/template-builder");
  }
  if (section === "email-templates") {
    redirect("/admin_recruiter/email-templates");
  }
  if (section === "security") {
    redirect("/admin_recruiter/account/security");
  }
  if (section === "profile") {
    redirect("/admin_recruiter/account/personal");
  }
  if (section === "account") {
    redirect("/admin_recruiter/account/account-settings");
  }
  if (section === "automation") {
    redirect("/admin_recruiter/dashboard/onboarding-flows");
  }
  if (!isSettingsSectionSlug(section)) {
    notFound();
  }
  return <SettingsSectionClient section={section as SettingsSectionSlug} />;
}
