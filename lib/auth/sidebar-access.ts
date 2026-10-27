import type { SidebarLink, SidebarSection } from "@/app/admin_recruiter/components/sidebar-config";

function keepLink(link: SidebarLink, viewKeys: ReadonlySet<string>, parentAllowed: boolean): SidebarLink | null {
  const allowed = link.resourceKey
    ? link.resourceKey === "dashboard" || viewKeys.has(link.resourceKey)
    : parentAllowed;
  const children = (link.children ?? [])
    .map((child) => keepLink(child, viewKeys, allowed))
    .filter((child): child is SidebarLink => child !== null);
  if (!allowed) return null;
  if (link.children && children.length === 0 && !link.resourceKey) return null;
  return { ...link, children: link.children ? children : undefined };
}

/** Hides sidebar rows the signed-in role cannot view. Dashboard stays visible. */
export function visibleSidebarSections(
  sections: SidebarSection[],
  viewKeys: ReadonlySet<string>,
  unrestricted = false
): SidebarSection[] {
  if (unrestricted) return sections;
  const visible: SidebarSection[] = [];
  for (const section of sections) {
    const allowed =
      !section.resourceKey || section.resourceKey === "dashboard" || viewKeys.has(section.resourceKey);
    const children = (section.children ?? [])
      .map((child) => keepLink(child, viewKeys, allowed))
      .filter((child): child is SidebarLink => child !== null);
    if (section.resourceKey && !allowed) continue;
    if (!section.resourceKey && section.children && children.length === 0) continue;
    visible.push({ ...section, children: section.children ? children : undefined });
  }
  return visible;
}
