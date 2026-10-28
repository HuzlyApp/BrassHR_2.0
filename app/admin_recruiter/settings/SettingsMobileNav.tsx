"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SETTINGS_NAV_GROUPS,
  isSettingsNavItemActive,
} from "@/app/admin_recruiter/settings/settings-nav";

/** Compact horizontal nav for viewports where the Figma sidebar is hidden. */
export default function SettingsMobileNav() {
  const pathname = usePathname() ?? "";
  const items = SETTINGS_NAV_GROUPS.flatMap((group) => group.items);

  return (
    <nav
      aria-label="Settings sections"
      className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
    >
      {items.map((item) => {
        const active = isSettingsNavItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors ${
              active
                ? "border border-[color:var(--brand-primary)] text-[color:var(--brand-primary)]"
                : "border border-[#E5E7EB] text-[#012352]"
            }`}
          >
            <Icon className="size-4 text-[color:var(--brand-primary)]" strokeWidth={1.5} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
