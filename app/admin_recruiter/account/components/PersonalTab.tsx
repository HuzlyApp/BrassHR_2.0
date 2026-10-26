"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import { getAccountDisplayName, accountRoleLabel } from "@/lib/account/display-name";
import { syncAccountChecklist } from "@/lib/account/fetch-account-data";
import { resolvePersonalProfileFields } from "@/lib/account/resolve-personal-profile-fields";
import {
  filterCandidateFieldInput,
  validateCandidateFieldInput,
} from "@/lib/admin/worker-profile-field-client";
import {
  isPersonNameTooLong,
  PERSON_NAME_MAX_LENGTH,
  personNameTooLongMessage,
} from "@/lib/person-name";
import { formatPhoneNumber } from "@/lib/phone";
import { isValidStep1Zip5, step1ZipStateMessage } from "@/lib/onboardingStep1Validation";
import {
  addressValidationMessage,
  normalizeBusinessZipInput,
  phoneValidationMessage,
} from "@/lib/tenant/business-info-validation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { FIELD, FieldLabel, SelectField, US_STATES } from "./account-form-fields";
import { StaffProfilePhotoUpload } from "./StaffProfilePhotoUpload";
import {
  AccountErrorBanner,
  AccountLoadingSkeleton,
  AccountSaveButton,
  AccountSuccessBanner,
} from "./AccountFormStatus";

export default function PersonalTab() {
  const { user, profile, organization, settings, checklist, loading, error, refresh } =
    useAccountData();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [address, setAddress] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [emailChangeNotice, setEmailChangeNotice] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);

  const resolvedFields = useMemo(
    () => resolvePersonalProfileFields(profile, organization),
    [profile, organization]
  );

  useEffect(() => {
    if (!profile && !user && !organization) return;
    setFirstName(resolvedFields.firstName);
    setLastName(resolvedFields.lastName);
    setWorkEmail(user?.email ?? resolvedFields.workEmail);
    setJobTitle(resolvedFields.jobTitle);
    setPhone(resolvedFields.phone);
    setPhotoUrl(profile?.avatar_url ?? null);
    setCity(resolvedFields.city);
    setState(resolvedFields.state);
    setZipCode(resolvedFields.zipCode);
    setAddress(resolvedFields.address);
  }, [profile, user, organization, resolvedFields]);

  const displayName = getAccountDisplayName(profile, user);
  const roleLabel = accountRoleLabel(profile);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    setEmailChangeNotice(null);
    setPhoneError(null);
    setAddressError(null);
    setZipError(null);

    if (isPersonNameTooLong(firstName) || isPersonNameTooLong(lastName)) {
      setSaveError(
        personNameTooLongMessage(isPersonNameTooLong(firstName) ? "First name" : "Last name")
      );
      setSaving(false);
      return;
    }

    const nextPhoneError = phone.trim()
      ? phoneValidationMessage(phone, { required: false })
      : null;
    const nextAddressError = address.trim()
      ? addressValidationMessage(address, { required: false })
      : null;
    let nextZipError: string | null = null;
    if (zipCode.trim()) {
      if (!isValidStep1Zip5(zipCode)) {
        nextZipError = "Enter a valid 5-digit ZIP code.";
      } else if (state.trim()) {
        nextZipError = step1ZipStateMessage(zipCode, state);
      }
    }

    setPhoneError(nextPhoneError);
    setAddressError(nextAddressError);
    setZipError(nextZipError);

    if (nextPhoneError || nextAddressError || nextZipError) {
      setSaving(false);
      return;
    }

    let phoneToSave: string | null = null;
    if (phone.trim()) {
      const phoneCheck = validateCandidateFieldInput("phone", phone);
      if (!phoneCheck.ok) {
        setPhoneError(phoneCheck.error);
        setSaving(false);
        return;
      }
      phoneToSave = formatPhoneNumber(phoneCheck.value);
    }

    const zipToSave = zipCode.trim() ? normalizeBusinessZipInput(zipCode).slice(0, 5) : null;

    try {
      const trimmedEmail = workEmail.trim();
      const emailChanged = trimmedEmail && trimmedEmail !== (user.email ?? "");

      const { error: profileError } = await supabaseBrowser
        .from("users")
        .update({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phoneToSave,
          job_title: jobTitle.trim() || null,
          address_line1: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip_code: zipToSave,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      if (emailChanged) {
        const { error: emailError } = await supabaseBrowser.auth.updateUser({
          email: trimmedEmail,
        });
        if (emailError) throw emailError;
        setEmailChangeNotice(
          "A confirmation email may be sent to verify your new address before it takes effect."
        );
      }

      await refresh();
      const refreshed = await syncAccountChecklist(supabaseBrowser, {
        user,
        profile: {
          ...(profile ?? { id: user.id }),
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          full_name: [firstName, lastName].filter(Boolean).join(" ").trim() || null,
          email: trimmedEmail,
          phone: phoneToSave,
          avatar_url: photoUrl,
          role: profile?.role ?? null,
          job_title: jobTitle.trim() || null,
          organization_id: profile?.organization_id ?? null,
          address_line1: address.trim() || null,
          address_line2: profile?.address_line2 ?? null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip_code: zipToSave,
          created_at: profile?.created_at ?? null,
          updated_at: new Date().toISOString(),
        },
        organization,
        settings,
        checklist,
      });
      if (refreshed) await refresh();

      setSaveSuccess("Profile saved successfully.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-5 sm:p-6">
        <AccountLoadingSkeleton rows={6} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[#E5E7EB] bg-white p-5 sm:p-6">
      {error ? <AccountErrorBanner message={error} /> : null}
      {saveError ? <AccountErrorBanner message={saveError} /> : null}
      {saveSuccess ? <AccountSuccessBanner message={saveSuccess} /> : null}
      {emailChangeNotice ? <AccountSuccessBanner message={emailChangeNotice} /> : null}

      <div className="mb-6 flex flex-col items-center gap-3 rounded-lg border border-[#E5E7EB] bg-white px-4 py-4 text-center min-[500px]:flex-row min-[500px]:items-center min-[500px]:justify-between min-[500px]:text-left sm:px-5 sm:py-5">
        <div className="flex min-w-0 w-full flex-col items-center gap-2 min-[500px]:w-auto min-[500px]:flex-row min-[500px]:items-center min-[500px]:gap-4">
          <StaffProfilePhotoUpload
            displayName={displayName}
            photoUrl={photoUrl}
            onPhotoUpdated={setPhotoUrl}
            variant="card"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-[#012352] min-[500px]:text-xl">{displayName}</p>
            <p className="mt-0.5 text-sm text-[#64748B]">{roleLabel}</p>
          </div>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center rounded-full border border-[#E2E8F0] bg-white px-4 text-sm font-normal text-[#64748B]">
          Active
        </span>
      </div>

      <section className="w-full max-w-2xl rounded-lg border border-[#E5E7EB] bg-white px-4 py-5 sm:px-6 sm:py-6">
        <h2 className="text-lg font-semibold leading-7 text-[#012352]">Basic Information</h2>

        <div className="mt-2.5 flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>First Name</FieldLabel>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={PERSON_NAME_MAX_LENGTH}
                className={FIELD}
              />
            </label>
            <label className="block">
              <FieldLabel>Last Name</FieldLabel>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={PERSON_NAME_MAX_LENGTH}
                className={FIELD}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Work Email</FieldLabel>
              <input
                type="email"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="block">
              <FieldLabel>Job Title</FieldLabel>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className={FIELD}
              />
            </label>
          </div>

          <label className="block">
            <FieldLabel>Phone</FieldLabel>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(filterCandidateFieldInput("phone", e.target.value));
                if (phoneError) setPhoneError(null);
              }}
              className={`${FIELD}${phoneError ? " border-[#FCA5A5] focus:border-[#EF4444] focus:ring-[#EF4444]" : ""}`}
              autoComplete="tel"
            />
            {phoneError ? <p className="mt-1 text-xs text-[#B91C1C]">{phoneError}</p> : null}
          </label>

          <StaffProfilePhotoUpload
            displayName={displayName}
            photoUrl={photoUrl}
            onPhotoUpdated={setPhotoUrl}
          />

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-[1.15fr_1.15fr_0.85fr]">
            <label className="block">
              <FieldLabel>City</FieldLabel>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={FIELD} />
            </label>
            <SelectField label="State" value={state} onChange={setState}>
              <option value="">Select state</option>
              {US_STATES.map((stateOption) => (
                <option key={stateOption} value={stateOption}>
                  {stateOption}
                </option>
              ))}
            </SelectField>
            <label className="block">
              <FieldLabel>Zip Code</FieldLabel>
              <input
                type="text"
                inputMode="numeric"
                value={zipCode}
                onChange={(e) => {
                  setZipCode(normalizeBusinessZipInput(e.target.value).slice(0, 5));
                  if (zipError) setZipError(null);
                }}
                className={`${FIELD}${zipError ? " border-[#FCA5A5] focus:border-[#EF4444] focus:ring-[#EF4444]" : ""}`}
              />
              {zipError ? <p className="mt-1 text-xs text-[#B91C1C]">{zipError}</p> : null}
            </label>
          </div>

          <label className="block">
            <FieldLabel>Address</FieldLabel>
            <input
              type="text"
              value={address}
              onChange={(e) => {
                setAddress(filterCandidateFieldInput("address", e.target.value));
                if (addressError) setAddressError(null);
              }}
              className={`${FIELD}${addressError ? " border-[#FCA5A5] focus:border-[#EF4444] focus:ring-[#EF4444]" : ""}`}
              autoComplete="street-address"
            />
            {addressError ? <p className="mt-1 text-xs text-[#B91C1C]">{addressError}</p> : null}
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <AccountSaveButton saving={saving} />
        </div>
      </section>
    </form>
  );
}
