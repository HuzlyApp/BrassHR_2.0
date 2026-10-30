"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import AdminFaqBrowser from "@/app/admin_recruiter/components/AdminFaqBrowser";
import {
  CANDIDATES_PAGE_TITLE_CLASS,
  CANDIDATES_PAGE_TITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";

const FAQ_SEARCH_INPUT_ID = "help-support-faq-search";
const ACTION_ICON_GRAY = "#94A3B8";

function ChatSendIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 shrink-0"
      aria-hidden
    >
      <path
        d="M1.33998 14L15.3333 8L1.33998 2L1.33331 6.66667L11.3333 8L1.33331 9.33333L1.33998 14Z"
        fill={ACTION_ICON_GRAY}
      />
    </svg>
  );
}

function HelpSupportActionRow({
  label,
  icon,
  onClick,
  href,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "flex h-14 w-[330px] max-w-full items-center gap-3 rounded-lg border border-[#E5E7EB] bg-white p-[14px] text-left text-base font-semibold leading-6 text-[#0F172A] transition hover:bg-[#FAFBFC]";

  if (href) {
    return (
      <Link href={href} className={className}>
        <span className="min-w-0 flex-1">{label}</span>
        {icon}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      <span className="min-w-0 flex-1">{label}</span>
      {icon}
    </button>
  );
}

export default function HelpSupportClient() {
  const branding = useTenantBranding();
  const companyName = branding.companyName?.trim() || "Company";
  const [faqSearchVisible, setFaqSearchVisible] = useState(false);

  function focusFaqSearch() {
    setFaqSearchVisible(true);
    const section = document.getElementById("help-faq-section");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      document.getElementById(FAQ_SEARCH_INPUT_ID)?.focus();
    }, 300);
  }

  return (
    <div className="w-full min-w-0">
      <div className="admin-recruiter-content-width">
        <div className="mb-5">
          <h1 className={CANDIDATES_PAGE_TITLE_CLASS} style={CANDIDATES_PAGE_TITLE_STYLE}>
            Hi {companyName}!
          </h1>
          <p
            className={`${CANDIDATES_PAGE_TITLE_CLASS} mt-1`}
            style={CANDIDATES_PAGE_TITLE_STYLE}
          >
            How can we help?
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-5 lg:p-6">
          <div className="flex flex-col gap-3">
            <HelpSupportActionRow
              label="Send us message"
              href="/admin_recruiter/messages"
              icon={<ChatSendIcon />}
            />
            <HelpSupportActionRow
              label="Open Ticket"
              href="/admin_recruiter/tickets/support"
              icon={<ChevronRight className="h-5 w-5 shrink-0" style={{ color: ACTION_ICON_GRAY }} aria-hidden />}
            />
            <HelpSupportActionRow
              label="Search for help"
              onClick={focusFaqSearch}
              icon={<Search className="h-5 w-5 shrink-0" style={{ color: ACTION_ICON_GRAY }} aria-hidden />}
            />
          </div>

          <div id="help-faq-section" className="mt-8">
            <AdminFaqBrowser
              variant="cards"
              loadingLabel="Loading help articles..."
              emptyConfiguredMessage="No FAQ articles are available yet."
              searchInputId={FAQ_SEARCH_INPUT_ID}
              showSearchBar={faqSearchVisible}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
