"use client";

import { Building2, ImageIcon, Link2 } from "lucide-react";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import {
  formatAccountNumber,
  accountRoleLabel,
  getAccountDisplayName,
  getOrganizationDisplayName,
} from "@/lib/account/display-name";
import { resolveImageSrc } from "@/lib/images/resolve-image-src";

type AccountTenantHeaderProps = {
  ownerName?: string;
  ownerRole?: string;
  ownerPhoto?: string | null;
  loading?: boolean;
};

export default function AccountTenantHeader({
  ownerName: ownerNameProp,
  ownerRole: ownerRoleProp,
  ownerPhoto: ownerPhotoProp,
  loading: loadingProp,
}: AccountTenantHeaderProps) {
  const { user, profile, organization, loading: accountLoading } = useAccountData();

  const loading = loadingProp ?? accountLoading;
  const ownerName = ownerNameProp ?? getAccountDisplayName(profile, user);
  const ownerRole = ownerRoleProp ?? accountRoleLabel(profile);
  const ownerPhoto = ownerPhotoProp ?? profile?.avatar_url ?? null;
  const companyName = getOrganizationDisplayName(organization, profile, user);
  const accountNumber = formatAccountNumber(organization?.id) ?? "—";
  const accountDomain =
    organization?.domain?.trim() ||
    (organization?.subdomain ? `${organization.subdomain}.brasshr.com` : "—");
  const ownerPhotoSrc = resolveImageSrc(ownerPhoto);
  const organizationLogoSrc = resolveImageSrc(organization?.logo_url);

  const displayName = loading ? "Loading…" : ownerName;

  return (
    <div className="mb-6 rounded-lg border border-[#E5E7EB] bg-white px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-7 text-[#012352]">{companyName}</h2>
          <div className="mt-2 space-y-1.5">
            <p className="flex items-center gap-2 text-sm text-[#64748B]">
              <Building2 className="h-4 w-4 shrink-0 text-[var(--brand-primary,#BC8B41)]" aria-hidden />
              Account #{accountNumber}
            </p>
            <p className="flex items-center gap-2 text-sm text-[#64748B]">
              <Link2 className="h-4 w-4 shrink-0 text-[var(--brand-primary,#BC8B41)]" aria-hidden />
              {accountDomain}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-[#E2E8F0] bg-[#F8FAFC]">
            {ownerPhotoSrc ? (
              <img
                src={ownerPhotoSrc}
                alt=""
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : organizationLogoSrc ? (
              <img
                src={organizationLogoSrc}
                alt=""
                width={48}
                height={48}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-[#CBD5E1]" strokeWidth={1.5} aria-hidden />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#012352]">{displayName}</p>
            <p className="mt-0.5 text-xs text-[#64748B]">{ownerRole}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
