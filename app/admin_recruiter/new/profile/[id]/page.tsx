"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import CandidateCommunicationDialog from "../../../components/CandidateCommunicationDialog";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import ProfileSubTabs from "../../../components/ProfileSubTabs";
import BrandedPlusIcon from "../../../components/BrandedPlusIcon";
import AssignFacilityModal from "../../../components/AssignFacilityModal";
import AddWorkerSkillModal from "../../../components/AddWorkerSkillModal";
import { CandidateStatusHistoryPanel } from "../../../components/CandidateApplicationStatusControl";
import CandidateNotesPanel from "../../../components/CandidateNotesPanel";
import CandidateDetailEditableField from "../../../components/CandidateDetailEditableField";
import CandidateDetailSelectField, {
  type SelectOption,
} from "../../../components/CandidateDetailSelectField";
import CandidateDetailCityField from "../../../components/CandidateDetailCityField";
import CandidateDetailResumeField from "../../../components/CandidateDetailResumeField";
import CandidateDetailReferenceField, {
  type ReferenceFormValue,
} from "../../../components/CandidateDetailReferenceField";
import {
  formatReferenceDisplay,
  isMissingCandidateValue,
  isPlaceholderPhone,
  isPlaceholderZip,
  referenceIsMissing,
} from "@/lib/admin/worker-profile-field-display";
import {
  buildProfileEducationLines,
  candidateProfileSectionHref,
  PROFILE_YEARS_EXPERIENCE_ANCHOR_ID,
  scrollToProfileField,
} from "@/lib/admin/candidate-profile-sections";
import {
  formatPhoneForDisplay,
  formatPhoneForEdit,
} from "@/lib/admin/worker-profile-field-client";
import {
  fetchStaffDetailJson,
  workerProfileApiUrl,
} from "@/lib/admin/staff-detail-fetch-cache";
import BrandedHistoryIcon from "../../../components/BrandedHistoryIcon";
import BrandedStepperCompleteIcon from "../../../components/BrandedStepperCompleteIcon";
import {
  Briefcase,
  Calendar,
  LogOut,
  Menu,
  Plus,
  Settings,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";

type OnboardingStep = {
  id: string;
  label: string;
  state: "complete" | "in_progress" | "pending";
  detail?: string;
};

type ProfilePayload = {
  worker: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    job_role: string | null;
    created_at: string | null;
    updated_at: string | null;
    status: string;
    status_label: string;
    date_of_birth: string | null;
    years_experience: number | null;
    hourly_rate: string | null;
    ssn_last_four: string | null;
    profile_photo_url?: string | null;
  };
  documents: {
    updated_at: string | null;
    nursing_license_url: boolean;
    tb_test_url: boolean;
    cpr_certification_url: boolean;
    identity_uploaded: boolean;
  } | null;
  references: Array<{ id: string; name: string; phone: string | null; email: string | null }>;
  skillAssessments: { completed: number; total: number; rows?: Array<Record<string, unknown>> };
  onboardingSteps: OnboardingStep[];
  onboardingCompletion?: {
    completedSteps: number;
    totalSteps: number;
    percent: number;
  };
  onboardingSubmission?: {
    submittedAt: string;
    submittedWithIncompleteSteps: boolean;
    incompleteStepKeys: string[];
    incompleteStepLabels: string[];
  } | null;
  activity: { source: string; created_at: string | null; updated_at: string | null };
  activity_logs?: Array<{
    id: string | null;
    action: string | null;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string | null;
  }>;
  activity_history?: Array<{
    id: string | null;
    action: string | null;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string | null;
  }>;
  requirements: {
    resume_path: string | null;
    resume_url: string | null;
  } | null;
  nursing_licenses?: Array<{
    id?: string | null;
    license_url: string | null;
    state: string | null;
    license_type: string | null;
    license_type_key?: string | null;
    expires_at: string | null;
  }>;
  profile_license?: {
    id: string | null;
    license_type: string;
    license_type_label: string;
    license_number: string | null;
    expires_at: string | null;
    has_file: boolean;
    status: string | null;
    uploaded_at: string | null;
  } | null;
  education?: {
    source: string;
    resume_available: boolean;
    items: Array<Record<string, unknown>>;
  };
  experience?: {
    years: number | null;
    job_role: string | null;
    positions: string[];
    role_assignments: Array<{ role: string | null; job_category_name: string | null }>;
  };
  skills?: {
    positions: string[];
    role_assignments: Array<{ role: string | null; job_category_name: string | null }>;
    assessed_categories: Array<{ category_title: string | null; completed: boolean }>;
  };
  facilities_assigned?: Array<{
    assignment_id: string | null;
    assigned_at: string | null;
    status: string | null;
    shift_title: string | null;
    facility_name: string | null;
    facility_address: string | null;
  }>;
  profile_skills?: Array<{
    id: string;
    skill_name: string;
    created_at: string | null;
  }>;
  notes?: Array<Record<string, unknown>>;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NA";
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York",  year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function formatDateTimeLabel(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", 
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} - ${timePart}`;
}

function referenceToFormValue(
  ref: ProfilePayload["references"][number] | undefined
): ReferenceFormValue {
  const name = (ref?.name ?? "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");
  return {
    first,
    last,
    email: ref?.email ?? "",
    phone: ref?.phone ?? "",
  };
}

function formatHourlyRate(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "—";
  return `$ ${cleaned} / hr`;
}

function formatYearsExperience(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value} yrs`;
}

function ProfileSectionNavLink({
  href,
  ariaLabel,
  openEditAnchorId,
}: {
  href: string;
  ariaLabel: string;
  openEditAnchorId?: string;
}) {
  const hashIndex = href.indexOf("#");
  const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : "";

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex shrink-0 rounded-full transition-opacity hover:opacity-80"
      onClick={(event) => {
        if (!hash || typeof window === "undefined") return;
        if (window.location.pathname !== path) return;
        event.preventDefault();
        scrollToProfileField(hash, Boolean(openEditAnchorId && hash === openEditAnchorId));
      }}
    >
      <BrandedPlusIcon className="h-6 w-6 cursor-pointer" />
    </Link>
  );
}

function formatDobForEdit(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

export default function NewApplicantProfilePage() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  const isWorkerRoute = pathname?.startsWith("/admin_recruiter/workers/") ?? false;
  const base = "/admin_recruiter/new";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [commOpen, setCommOpen] = useState(false);
  const pageLoading = loading;
  const [approvingForWork, setApprovingForWork] = useState(false);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<{
    states: SelectOption[];
    cities: SelectOption[];
    alliedHealthRoles: SelectOption[];
    licenseTypes: SelectOption[];
    workerStateCode: string;
    workerStateName: string;
  } | null>(null);
  const [cityOptions, setCityOptions] = useState<SelectOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [showAssignFacilityModal, setShowAssignFacilityModal] = useState(false);
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [unassignedFacilityCount, setUnassignedFacilityCount] = useState(0);

  async function reloadProfile() {
    if (!applicantId) return;
    const { ok, payload: json } = await fetchStaffDetailJson<ProfilePayload & { error?: string }>(
      workerProfileApiUrl(applicantId),
      { bust: true }
    );
    if (!ok) throw new Error(json.error || "Failed to reload profile");
    setData(json);
  }

  async function reloadFacilityMeta() {
    if (!applicantId) return;
    try {
      const res = await fetch(
        `/api/admin/facility-assignments?workerId=${encodeURIComponent(applicantId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        meta?: { unassignedCount?: number };
        potential?: unknown[];
      };
      if (!res.ok) return;
      setUnassignedFacilityCount(
        json.meta?.unassignedCount ?? (Array.isArray(json.potential) ? json.potential.length : 0)
      );
    } catch (e) {
      console.error(e);
    }
  }

  async function saveWorkerField(field: string, value: string) {
    if (!applicantId) return;
    setFieldSaving(true);
    try {
      const res = await fetch("/api/admin/worker-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: applicantId, field, value }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not save");
      }
      await reloadProfile();
      toast.success("Saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save";
      toast.error(message);
      throw e;
    } finally {
      setFieldSaving(false);
    }
  }

  async function saveReference(referenceIndex: number, value: ReferenceFormValue) {
    if (!applicantId) return;
    setFieldSaving(true);
    try {
      const res = await fetch("/api/admin/worker-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: applicantId,
          field: "reference",
          referenceIndex,
          value,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save reference");
      await reloadProfile();
      toast.success("Saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save";
      toast.error(message);
      throw e;
    } finally {
      setFieldSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!applicantId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { ok, payload: json } = await fetchStaffDetailJson<ProfilePayload & { error?: string }>(
          workerProfileApiUrl(applicantId)
        );
        if (!ok) throw new Error(json.error || "Failed to load profile");
        if (!cancelled) setData(json);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load";
        console.error(e);
        if (!cancelled) {
          setError(message);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [applicantId]);

  useEffect(() => {
    if (!applicantId) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/facility-assignments?workerId=${encodeURIComponent(applicantId)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          meta?: { unassignedCount?: number };
          potential?: unknown[];
        };
        if (!res.ok || cancelled) return;
        setUnassignedFacilityCount(
          json.meta?.unassignedCount ?? (Array.isArray(json.potential) ? json.potential.length : 0)
        );
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applicantId]);

  useEffect(() => {
    if (pageLoading || typeof window === "undefined") return;
    if (window.location.hash !== `#${PROFILE_YEARS_EXPERIENCE_ANCHOR_ID}`) return;
    scrollToProfileField(PROFILE_YEARS_EXPERIENCE_ANCHOR_ID, true);
  }, [pageLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadFieldOptions() {
      if (!applicantId) return;
      try {
        const res = await fetch(
          `/api/admin/worker-profile/field-options?workerId=${encodeURIComponent(applicantId)}`
        );
        const json = (await res.json()) as {
          states?: SelectOption[];
          cities?: SelectOption[];
          alliedHealthRoles?: SelectOption[];
          licenseTypes?: SelectOption[];
          workerStateCode?: string;
          workerStateName?: string;
          error?: string;
        };
        if (!res.ok || cancelled) return;
        setFieldOptions({
          states: json.states ?? [],
          cities: json.cities ?? [],
          alliedHealthRoles: json.alliedHealthRoles ?? [],
          licenseTypes: json.licenseTypes ?? [],
          workerStateCode: json.workerStateCode ?? "",
          workerStateName: json.workerStateName ?? "",
        });
        setCityOptions(json.cities ?? []);
      } catch (e) {
        console.error(e);
      }
    }

    void loadFieldOptions();
    return () => {
      cancelled = true;
    };
  }, [applicantId, data?.worker?.state, data?.worker?.job_role]);

  const loadCitiesForState = useCallback(
    async (stateCode: string) => {
      if (!applicantId || !stateCode) {
        setCityOptions([]);
        return;
      }
      setCitiesLoading(true);
      try {
        const res = await fetch(
          `/api/admin/worker-profile/field-options?workerId=${encodeURIComponent(applicantId)}&stateCode=${encodeURIComponent(stateCode)}`
        );
        const json = (await res.json()) as { cities?: SelectOption[] };
        if (res.ok) setCityOptions(json.cities ?? []);
      } finally {
        setCitiesLoading(false);
      }
    },
    [applicantId]
  );

  async function saveCityWithState(city: string, stateCode: string) {
    if (!applicantId) return;
    setFieldSaving(true);
    try {
      if (stateCode) {
        const stateRes = await fetch("/api/admin/worker-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerId: applicantId, field: "state", value: stateCode }),
        });
        const stateJson = (await stateRes.json().catch(() => ({}))) as { error?: string };
        if (!stateRes.ok) throw new Error(stateJson.error || "Could not save state");
      }

      const cityRes = await fetch("/api/admin/worker-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: applicantId, field: "city", value: city }),
      });
      const cityJson = (await cityRes.json().catch(() => ({}))) as { error?: string };
      if (!cityRes.ok) throw new Error(cityJson.error || "Could not save city");

      await reloadProfile();
      toast.success("Saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save";
      toast.error(message);
      throw e;
    } finally {
      setFieldSaving(false);
    }
  }

  const w = data?.worker;
  const candidateName = useMemo(() => {
    const n = `${w?.first_name ?? ""} ${w?.last_name ?? ""}`.trim();
    return n || "Applicant";
  }, [w?.first_name, w?.last_name]);
  const candidateRole = w?.job_role?.trim() || "—";
  const candidateLocation = useMemo(() => {
    const parts = [w?.city ?? "", w?.state ?? "", w?.zip ?? ""].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  }, [w?.city, w?.state, w?.zip]);

  const id = applicantId ?? "";

  const alliedHealthRoleValue = useMemo(() => {
    return (
      data?.experience?.role_assignments?.[0]?.role ??
      data?.skills?.positions?.[0] ??
      w?.job_role ??
      ""
    );
  }, [data?.experience?.role_assignments, data?.skills?.positions, w?.job_role]);

  const licenseTypeKey = useMemo(() => {
    return (
      data?.profile_license?.license_type ??
      data?.nursing_licenses?.[0]?.license_type_key ??
      ""
    );
  }, [data?.profile_license?.license_type, data?.nursing_licenses]);

  const licenseTypeDisplay = useMemo(() => {
    return (
      data?.profile_license?.license_type_label ??
      data?.nursing_licenses?.[0]?.license_type ??
      ""
    );
  }, [data?.profile_license?.license_type_label, data?.nursing_licenses]);

  const licenseExpiresAt = useMemo(() => {
    return data?.profile_license?.expires_at ?? data?.nursing_licenses?.[0]?.expires_at ?? null;
  }, [data?.profile_license?.expires_at, data?.nursing_licenses]);

  const applyingStateCode = useMemo(() => {
    const raw = (w?.state ?? "").trim();
    if (!raw) return fieldOptions?.workerStateCode ?? "";
    if (raw.length === 2) return raw.toUpperCase();
    return (
      fieldOptions?.states.find((s) => s.label.toLowerCase() === raw.toLowerCase())?.value ?? raw
    );
  }, [w?.state, fieldOptions]);

  const applyingStateDisplay = useMemo(() => {
    if (!applyingStateCode) return "";
    return (
      fieldOptions?.states.find((s) => s.value === applyingStateCode)?.label ??
      fieldOptions?.workerStateName ??
      w?.state ??
      ""
    );
  }, [applyingStateCode, fieldOptions, w?.state]);

  const resumeAttached = Boolean(data?.requirements?.resume_url || data?.requirements?.resume_path);
  const nursingLicenseRows = useMemo(() => {
    const fromApi = (data?.nursing_licenses ?? []).map((license, idx) => ({
      tag: `L${idx + 1}`,
      registration: license.license_type ?? "—",
      state: license.state ?? "—",
      expiry: formatDate(license.expires_at),
    }));
    if (fromApi.length > 0) return fromApi;
    return [
      {
        tag: "L1",
        registration: "—",
        state: w?.state ?? "—",
        expiry: "—",
      },
    ];
  }, [data?.nursing_licenses, w?.state]);

  const nursingLicenseRedirectHref = `${base}/attachments/${id}`;

  const onboardingCompleted = useMemo(
    () => (data?.onboardingSteps ?? []).length > 0 && (data?.onboardingSteps ?? []).every((s) => s.state === "complete"),
    [data?.onboardingSteps]
  );

  const onboardingSectionMinHeight = useMemo(() => {
    const stepCount = Math.max(data?.onboardingSteps?.length ?? 0, 1);
    const stepRowHeight = 76;
    return 44 + 40 + stepCount * stepRowHeight;
  }, [data?.onboardingSteps?.length]);

  const profileSectionLinks = useMemo(
    () => ({
      education: candidateProfileSectionHref("education", id, isWorkerRoute),
      experience: candidateProfileSectionHref("experience", id, isWorkerRoute),
      facilities: candidateProfileSectionHref("facilities", id, isWorkerRoute),
    }),
    [id, isWorkerRoute]
  );

  const educationSummaryLines = useMemo(
    () =>
      buildProfileEducationLines({
        profile_license: data?.profile_license,
        nursing_licenses: data?.nursing_licenses,
        requirements: data?.requirements ?? undefined,
        education: data?.education,
        formatDate,
      }),
    [data?.profile_license, data?.nursing_licenses, data?.requirements, data?.education]
  );

  const experienceRoleLabels = useMemo(() => {
    const fromAssignments = (data?.experience?.role_assignments ?? [])
      .map((item) => item.role || item.job_category_name)
      .filter(Boolean) as string[];
    if (fromAssignments.length > 0) return fromAssignments;
    return (data?.experience?.positions ?? []).filter(Boolean);
  }, [data?.experience]);

  const profileSkills = data?.profile_skills ?? [];
  const canAssignMoreFacilities = unassignedFacilityCount > 0;

  const handleApproveForWork = async () => {
    if (!applicantId) return;
    router.push(`/admin_recruiter/new/final-approval/${encodeURIComponent(applicantId)}`);
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 overflow-hidden">
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0A1F1C] text-white transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="px-6 py-8 flex items-center gap-3 border-b border-white/10">
            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center">
              <span className="text-[#0A1F1C] font-bold text-3xl">N</span>
            </div>
            <div>
              <div className="font-semibold text-2xl tracking-tight">Nexus</div>
              <div className="text-xs text-teal-400 -mt-1">MedPro Staffing</div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-8 space-y-1">
            <div className="px-4 text-xs uppercase tracking-widest text-teal-400/70 mb-4">
              PERSONAL SETTINGS
            </div>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
            >
              Profile
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
            >
              Account
            </a>

            <div className="px-4 pt-8 text-xs uppercase tracking-widest text-teal-400/70 mb-4">
              TEAM MANAGEMENT
            </div>

            {[
              { label: "Candidates", href: "/admin_recruiter/candidates", icon: Users },
              { label: "New", href: "/admin_recruiter/new", icon: UserPlus },
              { label: "Pending", href: "/admin_recruiter/pending", icon: UserCheck },
              { label: "Approved", href: "/admin_recruiter/approved", icon: UserCheck },
              { label: "Disapproved", href: "/admin_recruiter/disapproved", icon: UserX },
              { label: "Workers", href: "/admin_recruiter/workers", icon: Briefcase },
              { label: "Schedule", href: "/admin_recruiter/schedule", icon: Calendar },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 text-sm rounded-2xl transition-all ${
                    isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}

            <div className="px-4 pt-10">
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
              >
                <Settings className="w-5 h-5" /> Settings
              </a>
            </div>
          </nav>

          <div className="p-6 border-t border-white/10">
            <button className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/10 rounded-2xl">
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden lg:pl-72">
        <header className="h-16 border-b bg-white flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen((v) => !v)} className="lg:hidden text-gray-600">
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="font-semibold text-2xl">{isWorkerRoute ? "Worker" : "New Applicant"}</div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-1 rounded-full text-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Online
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-medium text-sm">Sean Smith</div>
                <div className="text-xs text-gray-600">Manager</div>
              </div>
              <img
                src="https://i.pravatar.cc/128?u=sean"
                alt="Sean Smith"
                className="w-9 h-9 rounded-full object-cover"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 w-full min-w-0 overflow-auto admin-recruiter-page-pad">
          <div className="admin-recruiter-content-width">
            <DetailedTabs applicantId={applicantId} activeTab="Profile" />

            {error ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {pageLoading ? (
              <CandidateDetailLoader label="Loading profile..." />
            ) : (
              <>
            <DetailedCandidateHeader
              name={candidateName}
              role={candidateRole}
              profilePhotoUrl={w?.profile_photo_url}
              workerId={applicantId}
              candidateEmail={w?.email ?? null}
              onMessageClick={() => setCommOpen(true)}
              messageDisabled={!w?.email?.trim() && !w?.phone?.trim()}
            />
            <ProfileSubTabs applicantId={applicantId} activeTab="Details" />
            <CandidateCommunicationDialog
              open={commOpen}
              onClose={() => setCommOpen(false)}
              workerId={applicantId ?? ""}
              candidateName={candidateName}
              email={w?.email ?? null}
              phone={w?.phone ?? null}
            />
            {applicantId ? (
              <AssignFacilityModal
                open={showAssignFacilityModal}
                workerId={applicantId}
                onClose={() => setShowAssignFacilityModal(false)}
                onAssigned={async () => {
                  await Promise.all([reloadProfile(), reloadFacilityMeta()]);
                }}
              />
            ) : null}
            {applicantId ? (
              <AddWorkerSkillModal
                open={showAddSkillModal}
                workerId={applicantId}
                onClose={() => setShowAddSkillModal(false)}
                onAdded={reloadProfile}
              />
            ) : null}

            <div className="w-full min-w-0 admin-recruiter-content-width overflow-x-hidden rounded-lg border border-[#D1D5DB] bg-white">
              <div className="hidden p-6 items-start justify-between gap-6 border-b border-[#9CC3FF]/30 bg-white/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-teal-600 text-white flex items-center justify-center font-semibold text-sm">
                    {initials(candidateName)}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-lg font-semibold text-gray-600">
                        {loading ? "Loading..." : candidateName}
                      </div>
                      <span className="text-[11px] px-3 py-1 rounded-full bg-white/70 border border-zinc-200 text-gray-600 font-medium">
                        {w?.status_label ?? "—"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">{candidateRole}</div>
                    <div className="text-xs text-gray-600">{candidateLocation}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="bg-white/70 border border-[#9CC3FF] text-gray-600 px-5 py-2.5 rounded-2xl hover:bg-white transition text-sm"
                  >
                    <Plus className="inline-block w-4 h-4 mr-2" />
                    New Appointment
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-stretch">
                <section className="min-w-0 space-y-0 border-b border-[#D1D5DB] lg:border-b-0 lg:border-r">
                  <div className="overflow-hidden bg-white">
                    <div className="flex min-h-11 items-center gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                      <h2 className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                        Candidate Details
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2">
                      <CandidateDetailEditableField
                        label="First Name"
                        displayValue={w?.first_name ?? "—"}
                        editValue={w?.first_name ?? ""}
                        fieldKind="person_name"
                        isMissing={isMissingCandidateValue(w?.first_name)}
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("first_name", value)}
                      />
                      <CandidateDetailEditableField
                        label="Last Name"
                        displayValue={w?.last_name ?? "—"}
                        editValue={w?.last_name ?? ""}
                        fieldKind="person_name"
                        isMissing={isMissingCandidateValue(w?.last_name)}
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("last_name", value)}
                      />
                      <CandidateDetailEditableField
                        label="Date of Birth(MM/DD/YYYY)"
                        displayValue={w?.date_of_birth ? formatDate(w.date_of_birth) : "—"}
                        editValue={formatDobForEdit(w?.date_of_birth)}
                        fieldKind="date_of_birth"
                        isMissing={isMissingCandidateValue(w?.date_of_birth)}
                        placeholder="MM/DD/YYYY"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("date_of_birth", value)}
                      />
                      <CandidateDetailEditableField
                        label="Email Address"
                        displayValue={w?.email ?? "—"}
                        editValue={w?.email ?? ""}
                        fieldKind="email"
                        isMissing={isMissingCandidateValue(w?.email)}
                        highlightValue
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("email", value)}
                      />
                      <CandidateDetailEditableField
                        anchorId={PROFILE_YEARS_EXPERIENCE_ANCHOR_ID}
                        label="Total Years of Experience in Your Profession"
                        displayValue={formatYearsExperience(w?.years_experience)}
                        editValue={w?.years_experience != null ? String(w.years_experience) : ""}
                        fieldKind="years_experience"
                        isMissing={w?.years_experience == null}
                        placeholder="Years"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("years_experience", value)}
                      />
                      <CandidateDetailEditableField
                        label="Address"
                        displayValue={w?.address1 ?? "—"}
                        editValue={w?.address1 ?? ""}
                        fieldKind="address"
                        isMissing={isMissingCandidateValue(w?.address1)}
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("address1", value)}
                      />
                      <CandidateDetailCityField
                        label="City"
                        displayValue={w?.city ?? "—"}
                        editValue={w?.city ?? ""}
                        isMissing={isMissingCandidateValue(w?.city)}
                        stateCode={applyingStateCode}
                        stateDisplay={applyingStateDisplay}
                        states={fieldOptions?.states ?? []}
                        cities={cityOptions}
                        citiesLoading={citiesLoading}
                        saving={fieldSaving}
                        onLoadCities={loadCitiesForState}
                        onSave={saveCityWithState}
                      />
                      <CandidateDetailEditableField
                        label="Zip Code"
                        displayValue={w?.zip ?? "—"}
                        editValue={w?.zip ?? ""}
                        fieldKind="zip"
                        isMissing={isMissingCandidateValue(w?.zip) || isPlaceholderZip(w?.zip)}
                        placeholder="12345"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("zip", value)}
                      />
                      <CandidateDetailEditableField
                        label="Phone Number"
                        displayValue={formatPhoneForDisplay(w?.phone)}
                        editValue={formatPhoneForEdit(w?.phone)}
                        fieldKind="phone"
                        isMissing={isMissingCandidateValue(w?.phone) || isPlaceholderPhone(w?.phone)}
                        placeholder="(555) 555-5555"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("phone", value)}
                      />
                      <CandidateDetailEditableField
                        label="Last Four Digits of SSN"
                        displayValue={w?.ssn_last_four ?? "—"}
                        editValue={w?.ssn_last_four ?? ""}
                        fieldKind="ssn_last_four"
                        isMissing={isMissingCandidateValue(w?.ssn_last_four)}
                        placeholder="1234"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("ssn_last_four", value)}
                      />
                      <div className="contents">
                        <div className="border-b border-[#E5E7EB] px-3 py-3 text-[14px] font-normal leading-5 text-[#374151] sm:border-r sm:px-5">
                          Work Status
                        </div>
                        <div className="border-b border-[#E5E7EB] px-3 py-3 text-[14px] font-normal leading-5 text-[#111827] sm:px-5">
                          {w?.status_label ?? "—"}
                        </div>
                      </div>
                      <CandidateDetailEditableField
                        label="Hourly Rate"
                        displayValue={formatHourlyRate(w?.hourly_rate)}
                        editValue={w?.hourly_rate ?? ""}
                        fieldKind="hourly_rate"
                        isMissing={isMissingCandidateValue(w?.hourly_rate)}
                        placeholder="25.00"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("hourly_rate", value)}
                      />
                      <CandidateDetailReferenceField
                        label="Reference 1 (Name, Email, Phone, Relationship)"
                        displayValue={formatReferenceDisplay(data?.references?.[0])}
                        value={referenceToFormValue(data?.references?.[0])}
                        isMissing={referenceIsMissing(data?.references?.[0])}
                        saving={fieldSaving}
                        onSave={(value) => saveReference(0, value)}
                      />
                      <CandidateDetailReferenceField
                        label="Reference 2 (Name, Email, Phone, Relationship)"
                        displayValue={formatReferenceDisplay(data?.references?.[1])}
                        value={referenceToFormValue(data?.references?.[1])}
                        isMissing={referenceIsMissing(data?.references?.[1])}
                        saving={fieldSaving}
                        onSave={(value) => saveReference(1, value)}
                      />
                      <div className="contents">
                        <div className="border-b border-[#E5E7EB] px-3 py-3 text-[14px] font-normal leading-5 text-[#374151] sm:border-r sm:px-5">
                          Primary Practice Setting
                        </div>
                        <div className="border-b border-[#E5E7EB] px-3 py-3 text-[14px] font-normal leading-5 break-all text-[#111827] sm:px-5">
                          {data?.facilities_assigned?.[0]?.facility_name ?? candidateLocation}
                        </div>
                      </div>
                      <CandidateDetailSelectField
                        label="Primary Allied Health Role"
                        displayValue={alliedHealthRoleValue || "—"}
                        editValue={alliedHealthRoleValue}
                        isMissing={isMissingCandidateValue(alliedHealthRoleValue)}
                        options={fieldOptions?.alliedHealthRoles ?? []}
                        optionsLoading={!fieldOptions}
                        placeholder="Pick role"
                        emptyMessage="No roles found for this company."
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("job_role", value)}
                      />
                      <CandidateDetailSelectField
                        label="Professional License / Certification Type"
                        displayValue={licenseTypeDisplay || "—"}
                        editValue={licenseTypeKey}
                        isMissing={isMissingCandidateValue(licenseTypeKey)}
                        options={fieldOptions?.licenseTypes ?? []}
                        optionsLoading={!fieldOptions}
                        placeholder="Pick license type"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("license_type", value)}
                      />
                      <CandidateDetailEditableField
                        label="License Expiration Date"
                        displayValue={licenseExpiresAt ? formatDate(licenseExpiresAt) : "—"}
                        editValue={formatDobForEdit(licenseExpiresAt)}
                        fieldKind="date_of_birth"
                        isMissing={isMissingCandidateValue(licenseExpiresAt)}
                        placeholder="MM/DD/YYYY"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("license_expires_at", value)}
                      />
                      <CandidateDetailSelectField
                        label="Which State are you applying for?"
                        displayValue={applyingStateDisplay || "—"}
                        editValue={applyingStateCode}
                        isMissing={
                          isMissingCandidateValue(applyingStateCode) &&
                          isMissingCandidateValue(w?.state)
                        }
                        options={fieldOptions?.states ?? []}
                        optionsLoading={!fieldOptions}
                        placeholder="Pick state"
                        saving={fieldSaving}
                        onSave={(value) => saveWorkerField("state", value)}
                      />
                      <CandidateDetailResumeField
                        label="Resume file"
                        attached={resumeAttached}
                        resumeHref={`${base}/profile/resume/${id}`}
                      />
                    </div>
                  </div>

                  <div className="border-t border-[#E5E7EB] bg-white">
                    <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                      <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                        Nursing Licenses
                      </div>
                    </div>
                    <div className="flex flex-col px-3 py-3 sm:px-4">
                      <div className="overflow-x-auto overflow-y-hidden rounded-md border border-[#E5E7EB]">
                        {nursingLicenseRows.map((row, rowIdx) => (
                          <div
                            key={row.tag}
                            className={`grid min-w-[280px] grid-cols-[40px_minmax(0,1fr)] sm:min-w-0 sm:grid-cols-[55px_minmax(0,1fr)] ${rowIdx > 0 ? "border-t border-[#E5E7EB]" : ""}`}
                          >
                            <div className="flex min-h-[134px] items-center justify-center border-r border-[#E5E7EB] px-2 text-[12px] font-normal leading-4 text-[#6B7280] sm:px-5 md:h-[134px]">
                              {row.tag}
                            </div>
                            <div className="min-h-[134px] md:h-[134px]">
                              {(
                                [
                                  ["State Nursing License Registration #", row.registration],
                                  ["State Nursing License", row.state],
                                  ["License Expiry Date", row.expiry],
                                ] as const
                              ).map(([label, value], idx) => (
                                <div
                                  key={`${row.tag}-${label}`}
                                  className={`grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] ${idx > 0 ? "border-t border-[#E5E7EB]" : ""}`}
                                >
                                  <div className="min-h-11 border-b border-[#E5E7EB] px-3 py-2 text-[13px] font-normal leading-5 text-[#374151] sm:border-b-0 sm:border-r sm:py-3 sm:text-[14px] md:h-11">
                                    {label}
                                  </div>
                                  <div className="min-h-11 px-3 py-2 text-[13px] font-normal leading-5 text-[#111827] sm:py-3 sm:text-[14px] md:h-11">
                                    {label === "State Nursing License" && value !== "—" ? (
                                      <span className="text-[#111827]">
                                        <span className="mr-1 text-[#0D9488]">⌄</span>
                                        {value}
                                      </span>
                                    ) : (
                                      value
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center justify-center border-t border-[#E5E7EB] py-4">
                        <button
                          type="button"
                          onClick={() => router.push(nursingLicenseRedirectHref)}
                          className="inline-flex h-9 w-full max-w-[280px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0D9488] px-4 py-2 text-sm font-semibold text-[#0D9488] sm:w-auto sm:min-w-[175px]"
                        >
                          <span className="text-base leading-none">+</span>
                          Add Nursing License
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E5E7EB] bg-white">
                    <div className="flex min-h-11 items-center gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                      <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                        Activity Logs
                      </div>
                    </div>
                    <div className="p-3 sm:p-5">
                    <div className="overflow-hidden rounded-md border border-[#E5E7EB] text-xs">
                      {(
                        [
                          ["Source", data?.activity.source ?? "—"],
                          ["Created date", formatDateTimeLabel(data?.activity.created_at)],
                          ["Date resume added", formatDateTimeLabel(data?.requirements?.resume_path ? data?.activity.created_at : null)],
                          ["Created by", data?.activity_logs?.[0]?.details?.user_agent ? "API Session" : "N/A"],
                          ["Last updated", formatRelative(data?.activity.updated_at)],
                        ] as const
                      ).map(([k, v], idx) => (
                        <div
                          key={k}
                          className={`grid grid-cols-1 sm:grid-cols-2 ${idx > 0 ? "border-t border-[#E5E7EB]" : ""}`}
                        >
                          <div className="border-b border-[#E5E7EB] px-3 py-2 text-[13px] leading-5 text-[#374151] sm:border-b-0 sm:border-r sm:px-4 sm:py-3 sm:text-[14px]">
                            {k}
                          </div>
                          <div className="break-words px-3 py-2 text-[13px] leading-5 text-[#111827] sm:px-4 sm:py-3 sm:text-[14px]">
                            {v}
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E5E7EB] bg-white">
                    <div className="flex min-h-11 items-center gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                      <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                        Activity History
                      </div>
                    </div>
                    <div className="p-3 sm:p-5">
                    <div>
                      {(data?.activity_history ?? []).length === 0 ? (
                        <div className="py-3 text-xs text-[#6B7280]">No activity history found.</div>
                      ) : (
                        (data?.activity_history ?? []).slice(0, 6).map((entry, idx) => (
                          <div
                            key={entry.id ?? `history-${idx}`}
                            className={`flex items-start gap-3 py-3 ${idx < (data?.activity_history ?? []).slice(0, 6).length - 1 ? "border-b border-[#E5E7EB]" : ""}`}
                          >
                            <BrandedHistoryIcon className="mt-0.5 h-6 w-6 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-5 text-[#0D9488]">
                                {entry.action ?? "Activity"}
                              </div>
                              <div className="text-xs leading-4 text-[#6B7280]">
                                {formatRelative(entry.created_at)} - {formatDateTimeLabel(entry.created_at)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    </div>
                  </div>
                </section>

                <section className="h-full w-full min-w-0 space-y-0 lg:border-l lg:border-[#D1D5DB]">
                  <div className="w-full bg-white pr-px">
                      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                        <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                          Education
                        </div>
                        <ProfileSectionNavLink
                          href={profileSectionLinks.education}
                          ariaLabel="Open resume and education"
                        />
                      </div>
                      <div className="px-3 pb-5 pt-4 sm:px-5">
                      {educationSummaryLines.length > 0 ? (
                        <div className="space-y-2">
                          {educationSummaryLines.map((line) => (
                            <div key={`${line.label}-${line.value}`} className="break-words text-xs text-gray-600">
                              <span className="font-medium text-[#374151]">{line.label}: </span>
                              {line.href ? (
                                <a
                                  href={line.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#0D9488] underline"
                                >
                                  {line.value}
                                </a>
                              ) : (
                                line.value
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-600">No education details on file yet.</div>
                      )}
                      </div>
                  </div>

                    <div className="w-full border-t border-[#E5E7EB] bg-white pr-px">
                      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                        <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                          Experience
                        </div>
                        <ProfileSectionNavLink
                          href={profileSectionLinks.experience}
                          ariaLabel="Edit years of experience"
                          openEditAnchorId={PROFILE_YEARS_EXPERIENCE_ANCHOR_ID}
                        />
                      </div>
                      <div className="px-3 pb-5 pt-4 sm:px-5">
                      <div className="text-xs text-gray-600">Job role</div>
                      <div className="mt-2 break-words text-sm text-[#111827]">
                        {data?.experience?.job_role ?? candidateRole}
                      </div>
                      <div className="mt-3 text-xs text-gray-600">Years in profession</div>
                      <div className="mt-2 text-sm text-[#111827]">
                        {data?.experience?.years != null
                          ? formatYearsExperience(data.experience.years)
                          : formatYearsExperience(w?.years_experience)}
                      </div>
                      <div className="mt-3 text-xs text-gray-600">Roles</div>
                      <div className="mt-2 break-words text-sm text-[#111827]">
                        {experienceRoleLabels.length > 0 ? experienceRoleLabels.join(", ") : "N/A"}
                      </div>
                      </div>
                    </div>

                    <div className="w-full border-t border-[#E5E7EB] bg-white pr-px">
                      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                        <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                          Skills
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddSkillModal(true)}
                          aria-label="Add skill"
                          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                        >
                          <BrandedPlusIcon className="h-6 w-6 cursor-pointer" />
                        </button>
                      </div>
                      <div className="px-3 pb-5 pt-4 sm:px-5">
                      <div className="text-xs text-gray-600">Positions</div>
                      <div className="mt-2 break-words text-sm text-[#111827]">
                        {data?.skills?.positions?.length ? data.skills.positions.join(", ") : "N/A"}
                      </div>
                      <div className="mt-3 text-xs text-gray-600">Skills</div>
                      <div className="mt-2">
                        {profileSkills.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {profileSkills.map((skill) => (
                              <span
                                key={skill.id}
                                className="inline-flex rounded-full bg-[#DBEAFE] px-3 py-1 text-xs font-medium text-[#1D4ED8]"
                              >
                                {skill.skill_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-[#6B7280]">No skills added yet.</div>
                        )}
                      </div>
                      </div>
                    </div>

                    <div className="w-full border-t border-b border-[#E5E7EB] bg-white pr-px">
                      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                        <div className="min-w-0 truncate text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                          Facilities Assigned
                        </div>
                        <ProfileSectionNavLink
                          href={profileSectionLinks.facilities}
                          ariaLabel="Open facility assignments"
                        />
                      </div>
                      <div className="flex flex-col gap-3 px-3 pb-5 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                        <div className="min-w-0 flex-1 text-xs text-gray-600">
                          {data?.facilities_assigned?.length ? (
                            <div className="space-y-2">
                              {data.facilities_assigned.map((facility, index) => (
                                <div key={facility.assignment_id ?? `${facility.facility_name}-${index}`}>
                                  <div className="break-words text-sm font-medium text-[#111827]">
                                    {facility.facility_name || facility.shift_title || "Assignment"}
                                  </div>
                                  {facility.facility_address ? (
                                    <div className="mt-0.5 break-words text-xs text-[#6B7280]">
                                      {facility.facility_address}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "No facility assignments found"
                          )}
                        </div>
                        {canAssignMoreFacilities ? (
                          <button
                            type="button"
                            onClick={() => setShowAssignFacilityModal(true)}
                            className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#0D9488] px-4 py-2 text-sm font-semibold text-white sm:w-auto"
                          >
                            + Add
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="w-full border-t border-[#E5E7EB] bg-white pr-px lg:border-r lg:border-[#D1D5DB]"
                      style={{ minHeight: `${onboardingSectionMinHeight}px` }}
                    >
                      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2 sm:px-5 sm:py-0">
                        <div className="min-w-0 text-[16px] font-semibold leading-6 text-[#111827] sm:truncate sm:whitespace-nowrap sm:text-[18px]">
                          Onboarding Progress
                          {data?.onboardingCompletion?.totalSteps ? (
                            <span className="ml-2 inline-block text-sm font-normal text-[#6B7280]">
                              {data.onboardingCompletion.completedSteps}/
                              {data.onboardingCompletion.totalSteps} (
                              {data.onboardingCompletion.percent}%)
                            </span>
                          ) : null}
                        </div>
                        <span className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-[11px] font-medium text-white ${onboardingCompleted ? "bg-[#00B135]" : "bg-[#F59E0B]"}`}>
                          {onboardingCompleted ? "Completed" : "In Progress"}
                        </span>
                      </div>

                      <div className="p-3 sm:p-5">
                      {data?.onboardingSubmission?.submittedWithIncompleteSteps ? (
                        <div
                          role="status"
                          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 sm:px-4"
                        >
                          <p className="font-semibold">Submitted with incomplete onboarding items</p>
                          {data.onboardingSubmission.incompleteStepLabels.length > 0 ? (
                            <p className="mt-1 break-words">
                              Missing: {data.onboardingSubmission.incompleteStepLabels.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="relative space-y-0 text-xs text-gray-600">
                        <div className="absolute left-4 top-8 bottom-8 w-[2px] -translate-x-1/2 bg-[color:var(--brand-primary)]" />
                        {(data?.onboardingSteps ?? []).map((s, idx) => (
                          <div key={s.id} className="flex min-h-[64px] items-center gap-3 py-1 sm:min-h-[76px] sm:gap-4">
                            <div className="relative flex h-[64px] w-8 shrink-0 items-center justify-center sm:h-[76px]">
                              {s.state === "complete" ? (
                                <BrandedStepperCompleteIcon className="relative z-10 h-8 w-8" />
                              ) : (
                                <div className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-[color:var(--brand-primary)] bg-white text-[13px] font-semibold leading-none tabular-nums text-[color:var(--brand-primary)]">
                                  {idx + 1}
                                </div>
                              )}
                            </div>
                            <div className="flex min-h-[64px] min-w-0 flex-1 flex-col justify-center gap-1 py-1 sm:min-h-[76px]">
                              <div className="break-words text-[14px] font-semibold leading-5 text-[#111827]">{s.label}</div>
                              {s.detail ? (
                                <div className="break-words text-[12px] leading-5 text-[#6B7280]">{s.detail}</div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                        {loading ? (
                          <div className="text-gray-600">Loading progress…</div>
                        ) : null}
                      </div>
                      </div>
                    </div>

                    <div className="w-full border-t border-[#E5E7EB] bg-white pr-px">
                      <div className="flex min-h-11 items-center gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                        <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                          Skill assessments
                        </div>
                      </div>
                      <div className="p-3 sm:p-5">
                      <div className="text-xs text-gray-600">
                        Completed {data?.skillAssessments.completed ?? 0} of {data?.skillAssessments.total ?? 0}{" "}
                        tracked quizzes.
                      </div>
                      </div>
                    </div>

                  <div className="w-full border-t border-[#E5E7EB] bg-white pr-px">
                    <div className="flex min-h-11 items-center gap-2 border-b border-[#E5E7EB] px-3 sm:px-5">
                      <div className="text-[17px] font-semibold leading-7 text-[#111827] sm:text-[20px]">
                        Remarks
                      </div>
                    </div>
                    <div className="p-3 sm:p-5">
                    <div className="mb-4 text-xs text-[#6B7280]">For job recommendation</div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={handleApproveForWork}
                        disabled={approvingForWork || !applicantId}
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0D9488] px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:w-auto"
                      >
                        {approvingForWork ? "Opening…" : "Approve as Worker"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#99D8D3] bg-white px-4 text-xs font-semibold text-[#0D9488] sm:h-9 sm:w-auto"
                      >
                        Reactivate
                      </button>
                      <Link
                        href="/admin_recruiter/new"
                        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-4 text-xs font-semibold text-white transition hover:brightness-95 sm:h-9 sm:w-auto"
                      >
                        Back to New list
                      </Link>
                    </div>
                    </div>
                  </div>

                  <div className="w-full space-y-3 border-t border-[#E5E7EB] p-3">
                    <CandidateStatusHistoryPanel workerId={id} layout="sidebar" />
                    <CandidateNotesPanel
                      workerId={id}
                      candidateName={candidateName}
                      layout="sidebar"
                    />
                  </div>
                </section>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
