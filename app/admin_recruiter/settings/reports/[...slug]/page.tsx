import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ slug?: string[] }>;
};

export default async function SettingsReportsSubpathRedirectPage({ params }: Props) {
  const { slug } = await params;
  const subpath = slug?.length ? `/${slug.join("/")}` : "";
  redirect(`/admin_recruiter/reports${subpath}`);
}

