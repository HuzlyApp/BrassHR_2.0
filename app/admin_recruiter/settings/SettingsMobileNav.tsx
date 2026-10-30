"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  SETTINGS_NAV_GROUPS,
  isSettingsNavItemActive,
  visibleSettingsNavGroups,
} from "@/app/admin_recruiter/settings/settings-nav";

/** Compact horizontal nav for viewports where the Figma sidebar is hidden. */
export default function SettingsMobileNav() {
  const pathname = usePathname() ?? "";
  const [viewKeys, setViewKeys] = useState<Set<string> | null>(null);
  const [unrestricted, setUnrestricted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/access")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { godAdmin?: boolean; viewKeys?: string[] };
        if (cancelled) return;
        if (body.godAdmin) {
          setUnrestricted(true);
          setViewKeys(new Set(["*"]));
          return;
        }
        setViewKeys(new Set(body.viewKeys ?? []));
      })
      .catch(() => {
        if (!cancelled) setViewKeys(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => visibleSettingsNavGroups(SETTINGS_NAV_GROUPS, viewKeys, unrestricted).flatMap((group) => group.items),
    [unrestricted, viewKeys]
  );

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
