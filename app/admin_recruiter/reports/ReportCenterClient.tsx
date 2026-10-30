"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Search } from "lucide-react";
import {
  getCategoryCount,
  getReportsForCategory,
  REPORT_CATEGORIES,
  type ReportCategoryId,
  type ReportDefinition,
} from "@/app/admin_recruiter/reports/reports-config";

function ReportCard({ report }: { report: ReportDefinition }) {
  const Icon = report.icon;
  const isFeatured = report.featured;

  const cardContent = (
    <div
      className={`flex h-full min-h-[148px] w-full min-w-0 flex-col gap-5 rounded-md border p-[14px] transition ${
        isFeatured
          ? "border-[#BC8B41] bg-[#F4F4F4]"
          : "border-[#E5E7EB] bg-white hover:border-[#D1D5DB]"
      }`}
    >
      <div className="flex flex-col gap-3">
        <div
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-md p-1"
          style={{ backgroundColor: report.iconBg }}
        >
          <Icon className="h-6 w-6 text-[#012352]" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="space-y-1">
          <h3 className="font-[Inter,sans-serif] text-[12px] font-semibold leading-[16px] text-black">
            {report.title}
          </h3>
          <p className="font-[Inter,sans-serif] text-[10px] font-normal leading-[15px] text-[#4B5563]">
            {report.description}
          </p>
        </div>
      </div>
      {report.href ? (
        <span className="inline-flex items-center gap-1.5 font-[Inter,sans-serif] text-[10px] font-semibold leading-[15px] text-[#012352]">
          View report
          <ArrowRight className="h-3.5 w-3.5 -rotate-90" aria-hidden />
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-[Inter,sans-serif] text-[10px] font-semibold leading-[15px] text-[#94A3B8]">
          Coming soon
        </span>
      )}
    </div>
  );

  if (report.href) {
    return (
      <Link href={report.href} className="block min-w-0">
        {cardContent}
      </Link>
    );
  }

  return <div className="min-w-0 cursor-default opacity-90">{cardContent}</div>;
}

function CategoryNavItem({
  categoryId,
  label,
  icon: Icon,
  count,
  active,
  onSelect,
}: {
  categoryId: ReportCategoryId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  count: number;
  active: boolean;
  onSelect: (id: ReportCategoryId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(categoryId)}
      className={`flex w-full items-center justify-between rounded-md p-3 text-left transition ${
        active ? "bg-[#F4F4F4]" : "hover:bg-[#F9FAFB]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#BC8B41]" : "text-[#6B7280]"}`}
          strokeWidth={1.75}
          aria-hidden
        />
        <span
          className={`truncate font-[Inter,sans-serif] text-[12px] font-semibold leading-[16px] ${
            active ? "text-[#BC8B41]" : "text-[#374151]"
          }`}
        >
          {label}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <ChevronRight
          className={`h-3.5 w-3.5 ${active ? "text-[#BC8B41]" : "text-[#9CA3AF]"}`}
          aria-hidden
        />
        <span className="rounded-[2px] bg-[#E5E7EB] px-[3px] py-[3px] font-[Inter,sans-serif] text-[10px] font-normal leading-[15px] text-[#374151]">
          {count}
        </span>
      </span>
    </button>
  );
}

export default function ReportCenterClient() {
  const [activeCategory, setActiveCategory] = useState<ReportCategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const visibleReports = useMemo(
    () => getReportsForCategory(activeCategory, searchQuery, activeCategory === "all"),
    [activeCategory, searchQuery],
  );

  const sectionTitle =
    activeCategory === "all" && !searchQuery.trim() ? "Suggest Reports" : "Reports";

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[Inter,sans-serif] text-[30px] font-semibold leading-[36px] text-black">
            Report Center
          </h1>
          <p className="mt-0 font-[Inter,sans-serif] text-[16px] font-normal leading-[24px] text-[#374151]">
            Build reports and share data insights and improve your Workable usage.
          </p>
        </div>
        <div className="relative w-full shrink-0 sm:max-w-[317px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94A3B8]"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports"
            className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2 pl-10 pr-3 font-[Inter,sans-serif] text-[12px] font-light leading-[16px] text-[#111827] placeholder:text-[#94A3B8] focus:border-[#BC8B41] focus:outline-none focus:ring-1 focus:ring-[#BC8B41]"
            aria-label="Search reports"
          />
        </div>
      </div>

      <div className="flex min-h-[640px] flex-col gap-5 rounded-xl border border-[#E5E7EB] bg-white p-5 lg:flex-row">
        <aside className="w-full shrink-0 rounded-md border border-[#E5E7EB] p-5 lg:w-[290px]">
          <nav className="flex flex-col gap-2" aria-label="Report categories">
            {REPORT_CATEGORIES.map((category) => (
              <CategoryNavItem
                key={category.id}
                categoryId={category.id}
                label={category.label}
                icon={category.icon}
                count={getCategoryCount(category.id)}
                active={activeCategory === category.id}
                onSelect={setActiveCategory}
              />
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 px-0 lg:px-5">
          <h2 className="mb-5 font-[Inter,sans-serif] text-[18px] font-semibold leading-[28px] text-[#374151]">
            {sectionTitle}
          </h2>

          {visibleReports.length === 0 ? (
            <p className="py-12 text-center font-[Inter,sans-serif] text-sm text-[#6B7280]">
              No reports match your search.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
