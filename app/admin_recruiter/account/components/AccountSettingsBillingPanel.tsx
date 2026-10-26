"use client";

import { useMemo } from "react";
import {
  Building2,
  ImageIcon,
  Info,
  Link2,
} from "lucide-react";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import {
  formatAccountNumber,
  accountRoleLabel,
  getAccountDisplayName,
  getOrganizationDisplayName,
} from "@/lib/account/display-name";
import { resolveImageSrc } from "@/lib/images/resolve-image-src";

type BillingTab = "billing" | "subscription";

const COLORS = {
  headingTitleDark: "#012352",
  textLabels: "#64748B",
  warning50: "#FDF8F3",
  bgPrimary: "#FFFFFF",
} as const;

function formatTrialEndDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AccountSettingsBillingPanel() {
  const { user, profile, organization, loading } = useAccountData();
  const billingTab: BillingTab = "billing";

  const trialEndLabel = useMemo(() => formatTrialEndDate(28), []);
  const displayName = loading ? "—" : getAccountDisplayName(profile, user);
  const companyName = getOrganizationDisplayName(organization, profile, user);
  const accountNumber = formatAccountNumber(organization?.id) ?? "—";
  const accountDomain =
    organization?.domain?.trim() ||
    (organization?.subdomain ? `${organization.subdomain}.brasshr.com` : "—");
  const roleLabel = accountRoleLabel(profile);
  const profileAvatarSrc = resolveImageSrc(profile?.avatar_url);
  const organizationLogoSrc = resolveImageSrc(organization?.logo_url);

  return (
    <div
      className="w-full min-w-0 admin-recruiter-content-width rounded-lg border border-[#D1D5DB] p-5 sm:p-6"
      style={{ backgroundColor: COLORS.bgPrimary }}
    >
      <div
        className="rounded-lg border px-5 py-4"
        style={{ borderColor: "#E2E8F0", backgroundColor: COLORS.bgPrimary }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className="text-base font-semibold sm:text-lg"
              style={{ color: COLORS.headingTitleDark }}
            >
              {companyName}
            </h2>
            <div className="mt-2 space-y-1.5">
              <p className="flex items-center gap-2 text-sm" style={{ color: COLORS.textLabels }}>
                <Building2
                  className="h-4 w-4 shrink-0"
                  style={{ color: "var(--brand-primary)" }}
                  aria-hidden
                />
                Account #{accountNumber}
              </p>
              <p className="flex items-center gap-2 text-sm" style={{ color: COLORS.textLabels }}>
                <Link2
                  className="h-4 w-4 shrink-0"
                  style={{ color: "var(--brand-primary)" }}
                  aria-hidden
                />
                {accountDomain}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:shrink-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#E2E8F0] bg-[#F8FAFC]">
              {profileAvatarSrc ? (
                <img
                  src={profileAvatarSrc}
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
                <ImageIcon className="h-6 w-6 text-[#CBD5E1]" strokeWidth={1.5} />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: COLORS.headingTitleDark }}>
                {displayName}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: COLORS.textLabels }}>
                {roleLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-5 flex items-center gap-4 rounded-xl border px-5 py-4 sm:px-6 sm:py-5"
        style={{
          borderColor: "var(--brand-primary)",
          backgroundColor: COLORS.warning50,
        }}
        role="status"
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-white"
          style={{ borderColor: "var(--brand-primary)" }}
        >
          <BrandedSvgIcon
            src="/icons/braas-HR/client-dashboard/uil_rocket.svg"
            className="h-6 w-6"
            color="var(--brand-primary)"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug" style={{ color: COLORS.headingTitleDark }}>
            Your free trial ends on {trialEndLabel} (28 days)
          </p>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: COLORS.textLabels }}>
            Reach out to our product specialist or give us a call at{" "}
            <span className="font-medium" style={{ color: COLORS.textLabels }}>
              +1-811-722-2235
            </span>{" "}
            to signup. Upgrade Anytime
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        {(
          [
            { id: "billing" as const, label: "Billing" },
            { id: "subscription" as const, label: "Subscription" },
          ] as const
        ).map((tab) => {
          const isActive = billingTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                isActive ? "text-white" : "bg-transparent hover:opacity-90"
              }`}
              style={
                isActive
                  ? { backgroundColor: "var(--brand-primary)" }
                  : { color: COLORS.headingTitleDark }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {billingTab === "billing" ? (
        <div className="mt-6 space-y-6">
          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <h3 className="text-base font-semibold text-[#1E3A5F]">Billing Center</h3>
              <button
                type="button"
                aria-label="Billing center info"
                className="text-[#9CA3AF] hover:text-[#6B7280]"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg border border-[#E5E7EB] bg-white px-6 py-16">
              <div className="mx-auto flex max-w-md flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#F3F4F6]">
                  <BrandedSvgIcon
                    src="/icons/braas-HR/client-dashboard/solar_folder-broken.svg"
                    className="h-6 w-6"
                    color="var(--brand-primary)"
                  />
                </div>
                <p className="mt-4 text-base font-semibold text-[#111827]">Nothing to see here...</p>
                <p className="mt-2 text-sm text-[#6B7280]">
                  Once you have an invoice history, you will see it here.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-base font-semibold text-[#1E3A5F]">Billing Information</h3>

            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
              <div className="space-y-6">
                <div>
                  <div className="text-sm text-[#6B7280]">Customer</div>
                  <div className="mt-1 text-sm font-medium text-[#1E3A5F]">{companyName}</div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1 text-sm text-[#6B7280]">
                    Accounts Payable Emails
                    <Info className="h-3.5 w-3.5 text-[#9CA3AF]" aria-hidden />
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#1E3A5F]">
                    {organization?.email ?? user?.email ?? "—"}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="text-sm text-[#6B7280]">Bill To</div>
                  <div className="mt-1 text-sm font-medium text-[#1E3A5F]">{displayName}</div>
                </div>
                <div>
                  <div className="text-sm text-[#6B7280]">Company Tax ID</div>
                  <div className="mt-1 text-sm font-medium text-[#1E3A5F]">
                    {organization?.ein ?? "—"}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm text-[#6B7280]">Primary Payment Method</div>
                <div className="mt-1 text-sm font-medium text-[#1E3A5F]">None</div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3
              className="text-base font-semibold sm:text-lg"
              style={{ color: COLORS.headingTitleDark }}
            >
              My Subscription
            </h3>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border bg-white px-5 text-sm font-medium transition hover:bg-[#F8FAFC]"
              style={{
                borderColor: COLORS.headingTitleDark,
                color: COLORS.headingTitleDark,
              }}
            >
              Manage Subscription
            </button>
          </div>

          <div
            className="flex flex-col gap-4 rounded-lg border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "#E5E7EB", backgroundColor: COLORS.bgPrimary }}
          >
            <div>
              <p className="text-base font-semibold leading-6" style={{ color: COLORS.headingTitleDark }}>
                {organization?.plan ?? "Trial"}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: COLORS.textLabels }}>
                30 days trial
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
