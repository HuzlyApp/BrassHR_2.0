"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import SearchableSelectField from "@/app/tenant-onboarding/SearchableSelectField";
import { useUsLocationOptions } from "@/lib/location/use-us-location-options";
import { writeStoredApplyLocation } from "@/lib/service-area/apply-location-client";
import { useServiceAreaPreview } from "@/lib/service-area/use-service-area-preview";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";

type RelocateChoice = "onsite" | "relocate" | "remote";

type Props = {
  tenantSlug: string;
  jobToken: string;
  jobTitle: string;
  jobCity: string;
  continueHref: string;
};

const inputClass =
  "mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_20%,transparent)]";

const radioClass =
  "h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--brand-checkbox,var(--brand-primary))]";

export default function ApplyWorkLocationClient({
  tenantSlug,
  jobToken,
  jobTitle,
  jobCity,
  continueHref,
}: Props) {
  const router = useRouter();
  const branding = useTenantBranding();
  const [city, setCity] = useState("");
  const [stateLabel, setStateLabel] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [relocate, setRelocate] = useState<RelocateChoice | "">("");
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSent, setWaitlistSent] = useState(false);

  const {
    stateOptions,
    cityOptions,
    locationLoading,
    citiesLoading,
    selectedStateCode,
    displayStateValue,
  } = useUsLocationOptions(stateLabel);

  const effectiveCityOptions = useMemo(() => {
    const current = city.trim();
    if (!current || cityOptions.includes(current)) return cityOptions;
    return [...cityOptions, current].sort((a, b) => a.localeCompare(b));
  }, [city, cityOptions]);

  useEffect(() => {
    const current = city.trim();
    if (!current || cityOptions.length === 0) return;
    if (cityOptions.includes(current)) return;
    const match = cityOptions.find(
      (option) => option.toLowerCase() === current.toLowerCase()
    );
    if (match) setCity(match);
  }, [city, cityOptions]);

  const location = useMemo(
    () =>
      city.trim() && selectedStateCode && relocate
        ? {
            city: city.trim(),
            state: selectedStateCode,
            postalCode: postalCode.trim() || undefined,
            locationType: relocate === "remote" ? ("remote" as const) : ("onsite" as const),
            relocateToJobSite: relocate === "relocate" || relocate === "onsite",
          }
        : null,
    [city, selectedStateCode, postalCode, relocate]
  );

  const preview = useServiceAreaPreview(location, "apply", {
    jobToken,
    tenantSlug,
    publicClient: true,
  });

  const submitDisabled =
    !city.trim() || !selectedStateCode || !relocate || preview.loading || !preview.allowed;

  const shellStyle = useMemo(
    () =>
      ({
        ...brandingToCssVars(branding),
        fontFamily: "var(--brand-font-body)",
      }) as CSSProperties,
    [branding]
  );

  function handleStateChange(value: string) {
    setStateLabel(value);
    setCity("");
  }

  async function onContinue() {
    if (submitDisabled || !location) return;
    writeStoredApplyLocation(tenantSlug, jobToken, location);
    router.push(continueHref);
  }

  async function onWaitlist() {
    const email = waitlistEmail.trim();
    if (!email || !selectedStateCode) return;
    await fetch("/api/service-area/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        city: city.trim(),
        state: selectedStateCode,
        source: "apply",
        tenantSlug,
        jobToken,
      }),
    }).catch(() => null);
    setWaitlistSent(true);
  }

  return (
    <main
      className="flex min-h-screen items-start justify-center bg-[#F1F5F9] px-4 py-6 sm:items-center sm:px-6 sm:py-10"
      style={shellStyle}
    >
      <section className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)]">
        <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--brand-muted)", fontFamily: "var(--brand-font-body)" }}
          >
            Apply
          </p>
          <h1
            className="mt-1.5 text-lg font-semibold leading-snug sm:text-xl"
            style={{ color: "var(--brand-heading)", fontFamily: "var(--brand-font-heading)" }}
          >
            {jobTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500" style={{ fontFamily: "var(--brand-font-body)" }}>
            Confirm where you will work this job. Home address, school, and travel city are not used.
          </p>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <SearchableSelectField
            label="Work state"
            required
            compact
            loading={locationLoading}
            disabled={locationLoading}
            value={displayStateValue}
            onChange={handleStateChange}
            placeholder="Search state"
            searchPlaceholder="Type to search states"
            options={stateOptions}
            emptyMessage="No states found. Try another search."
          />

          <SearchableSelectField
            label="Work city"
            required
            compact
            loading={citiesLoading}
            disabled={!displayStateValue || citiesLoading || (!cityOptions.length && !city.trim())}
            value={city}
            onChange={setCity}
            placeholder={
              !displayStateValue
                ? "Select state first"
                : citiesLoading
                  ? "Loading…"
                  : "Search city"
            }
            searchPlaceholder="Type to search cities"
            options={effectiveCityOptions}
            emptyMessage="No cities found. Try another search."
          />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#0f172a]" htmlFor="work-zip">
              ZIP (optional)
            </label>
            <input
              id="work-zip"
              inputMode="numeric"
              autoComplete="postal-code"
              className={inputClass}
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="Code"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-800">
              Will you work on-site{jobCity ? ` at ${jobCity}` : ""}?
            </legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  { value: "onsite", label: "Yes" },
                  { value: "relocate", label: "Yes, I will relocate" },
                  { value: "remote", label: "No, I would work remote from the location above" },
                ] as const
              ).map((option) => {
                const selected = relocate === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm leading-5 transition ${
                      selected
                        ? "border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)] text-slate-900"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="relocate"
                      className={radioClass}
                      checked={selected}
                      onChange={() => setRelocate(option.value)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {preview.message ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {preview.message}
            </p>
          ) : null}

          {preview.message ? (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600">Email me if this location opens.</p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  className={`${inputClass} mt-0`}
                  placeholder="Email"
                  value={waitlistEmail}
                  onChange={(event) => setWaitlistEmail(event.target.value)}
                  aria-label="Email"
                />
                <button
                  type="button"
                  className="h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)]"
                  onClick={() => void onWaitlist()}
                >
                  Notify me
                </button>
              </div>
              {waitlistSent ? (
                <p className="mt-2 text-xs text-slate-500">We’ll email you if this location opens.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <button
            type="button"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-primary)" }}
            disabled={submitDisabled}
            onClick={() => void onContinue()}
          >
            {preview.loading ? "Checking…" : "Continue"}
          </button>
        </footer>
      </section>
    </main>
  );
}
