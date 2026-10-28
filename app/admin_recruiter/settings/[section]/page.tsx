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
  if (!isSettingsSectionSlug(section)) {
    notFound();
  }
  return <SettingsSectionClient section={section as SettingsSectionSlug} />;
}
