"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SETTINGS_NAV_GROUPS,
  isSettingsNavItemActive,
  type SettingsNavItem,
} from "@/app/admin_recruiter/settings/settings-nav";

function NavItemLink({ item, active }: { item: SettingsNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-1.5 overflow-hidden rounded px-2 py-1.5 text-xs leading-4 transition-colors ${
        active
          ? "border border-[color:var(--brand-primary)] bg-white text-[color:var(--brand-primary)]"
          : "border border-transparent text-[#012352] hover:bg-[#F8FAFC]"
      }`}
    >
      <Icon
        className="size-5 shrink-0"
        strokeWidth={1.5}
        aria-hidden
        style={active ? { color: "var(--brand-primary)" } : { color: "var(--brand-primary)" }}
      />
      <span className={active ? "font-normal" : "font-normal"}>{item.label}</span>
    </Link>
  );
}

export default function SettingsSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside
      aria-label="Settings sections"
      className="z-10 hidden h-full min-h-0 w-[195px] shrink-0 overflow-y-auto overscroll-y-contain border-x border-[#E5E7EB] bg-white px-3.5 py-5 lg:block"
    >
      <nav className="flex flex-col gap-3">
        {SETTINGS_NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.id} className="flex flex-col gap-3">
            {groupIndex > 0 ? <div className="h-px w-full bg-[#E5E7EB]" role="separator" /> : null}
            <div className="flex flex-col gap-3">
              {group.label ? (
                <p className="text-xs font-semibold uppercase leading-[18px] text-[#4B5563]">
                  {group.label}
                </p>
              ) : null}
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <NavItemLink
                    key={item.id}
                    item={item}
                    active={isSettingsNavItemActive(item, pathname)}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
