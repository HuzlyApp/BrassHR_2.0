"use client";

import Link from "next/link";

interface TemplateHubCard {
  title: string;
  description: string;
  href: string;
}

const TEMPLATE_CARDS: TemplateHubCard[] = [
  {
    title: "Document templates",
    description: "Build offer letters and other documents.",
    href: "/admin_recruiter/template-builder",
  },
  {
    title: "Email templates",
    description: "Edit messages sent to candidates and staff.",
    href: "/admin_recruiter/email-templates",
  },
  {
    title: "Onboarding templates",
    description: "Manage templates used in hiring workflows.",
    href: "/admin_recruiter/dashboard/templates",
  },
];

export default function TemplatesSettingsPanel() {
  return (
    <div className="flex flex-col gap-4">
      {TEMPLATE_CARDS.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="group block rounded-xl border border-[#EAECF0] bg-white p-5 transition-all duration-150 hover:border-[#D0D5DD] hover:shadow-sm"
        >
          <h2 className="text-sm font-semibold text-[#101828] group-hover:text-[color:var(--brand-primary)] transition-colors sm:text-base">
            {card.title}
          </h2>
          <p className="mt-1 text-xs text-[#667085] sm:text-sm">
            {card.description}
          </p>
        </Link>
      ))}
    </div>
  );
}

