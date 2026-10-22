"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import UnderlineTabBar from "../../../components/UnderlineTabBar";
import CreateFacilityModal from "../../../components/CreateFacilityModal";
import AssignFacilityModal from "../../../components/AssignFacilityModal";
import type { FacilityAssignmentsResponse, FacilityListItem } from "@/lib/facilities/types";
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

type WorkerProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  job_role: string | null;
  status_label?: string;
  profile_photo_url?: string | null;
};

type WorkerProfileResponse = {
  worker: WorkerProfile;
};

type FacilityTab = "active" | "potential" | "recent";

const FACILITY_TABS = [
  { id: "active" as const, label: "Active Facilities" },
  { id: "potential" as const, label: "Potential Facilities" },
  { id: "recent" as const, label: "Recent Facilities" },
] as const;

const EMPTY_ASSIGNMENTS: FacilityAssignmentsResponse = {
  active: [],
  potential: [],
  recent: [],
  meta: {
    tenantId: "",
    assignedFacilityIds: [],
    totalTenantFacilities: 0,
    unassignedCount: 0,
    assignedCount: 0,
  },
};

const FACILITIES_LOAD_ERROR = "Unable to load facilities. Please try again.";

function getEmptyStateCopy(tab: FacilityTab): { title: string; description: string } | null {
  if (tab === "active") {
    return {
      title: "No facilities assigned to this candidate yet.",
      description: "Assign an existing facility or create a new one to get started.",
    };
  }
  if (tab === "recent") {
    return {
      title: "No recent facilities for this candidate yet.",
      description: "Create a new facility to get started.",
    };
  }
  return {
    title: "No potential facilities found",
    description: "Create a new facility or assign an existing one to get started.",
  };
}

function formatAssignedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "short", day: "numeric", year: "numeric" });
}

function formatAssignedDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const datePart = date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", { timeZone: "America/New_York",  hour: "numeric", minute: "2-digit" });
  return `Assigned on ${datePart} at ${timePart}`;
}

function formatAssignmentStatus(status: string | null | undefined): string | null {
  if (!status?.trim()) return null;
  const normalized = status.trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function assignmentStatusBadgeClass(status: string): string {
  if (status.trim().toLowerCase() === "confirmed") {
    return "rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#166534]";
  }
  return "rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-[#475569]";
}

function FacilityActionButtons({
  onCreate,
  onAssign,
  layout = "row",
}: {
  onCreate: () => void;
  onAssign: () => void;
  layout?: "row" | "centered";
}) {
  const widthClass = layout === "centered" ? "w-full max-w-[237px]" : "max-md:flex-1";
  const containerClass =
    layout === "centered"
      ? "mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row"
      : "flex shrink-0 flex-wrap items-center gap-3 pb-1 max-md:w-full";

  return (
    <div className={containerClass}>
      <button
        type="button"
        onClick={onCreate}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#0D9488] bg-white px-4 py-2.5 text-sm font-medium text-[#0D9488] transition hover:bg-[#F0FDFA] ${widthClass}`}
      >
        <Plus className="h-4 w-4" />
        Create Facility
      </button>
      <button
        type="button"
        onClick={onAssign}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0B7F77] ${widthClass}`}
      >
        <Plus className="h-4 w-4" />
        Assign Facility
      </button>
    </div>
  );
}

function FacilityCard({
  facility,
  variant = "default",
}: {
  facility: FacilityListItem;
  variant?: "default" | "assigned" | "recent";
}) {
  const assignedDate = formatAssignedDate(facility.assignedAt);
  const assignedDateTime = formatAssignedDateTime(facility.assignedAt);
  const assignmentStatus = formatAssignmentStatus(facility.assignmentStatus);

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-[#F1F5F9] pb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-gradient-from) 0%, var(--brand-gradient-to) 100%)",
            }}
          >
            <img
              src="/icons/admin-recruiter/pie_chart_outlined.svg"
              alt="Facility icon"
              className="h-5 w-5"
            />
          </div>
          <div>
            <div className="text-lg font-semibold leading-7 text-black">{facility.name}</div>
            {variant === "assigned" ? (
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-[#0D9488]">
                Assigned facility
              </div>
            ) : null}
            {variant === "recent" && assignedDateTime ? (
              <div className="mt-1 text-xs font-medium text-[#0F766E]">{assignedDateTime}</div>
            ) : null}
          </div>
        </div>
        {assignmentStatus ? (
          <span className={assignmentStatusBadgeClass(facility.assignmentStatus ?? "")}>
            {assignmentStatus}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-[#4B5563]">
          <img
            src="/icons/admin-recruiter/locationfacility.svg"
            alt="Location"
            className="h-5 w-5"
          />
          <span>{facility.primaryAddress || "No address on file"}</span>
        </div>
        {facility.secondaryAddress ? (
          <div className="flex items-center gap-2 text-sm text-[#4B5563]">
            <img
              src="/icons/admin-recruiter/corporate_fare.svg"
              alt="Mailing address"
              className="h-5 w-5"
            />
            <span>{facility.secondaryAddress}</span>
          </div>
        ) : null}
        {facility.phone ? (
          <div className="text-sm text-[#4B5563]">
            <span className="font-medium text-[#374151]">Phone:</span> {facility.phone}
          </div>
        ) : null}
        {facility.contactPerson ? (
          <div className="text-sm text-[#4B5563]">
            <span className="font-medium text-[#374151]">Contact:</span> {facility.contactPerson}
          </div>
        ) : null}
        {variant !== "recent" && assignedDate ? (
          <div className="text-sm text-[#4B5563]">
            <span className="font-medium text-[#374151]">Assigned:</span> {assignedDate}
          </div>
        ) : null}
        {facility.distance ? (
          <div className="flex items-center gap-2 text-sm text-[#4B5563]">
            <img src="/icons/admin-recruiter/target.svg" alt="Distance" className="h-5 w-5" />
            <span>{facility.distance}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function NewApplicantFacilityAssignmentsPage() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const [profile, setProfile] = useState<WorkerProfileResponse | null>(null);
  const [assignments, setAssignments] = useState<FacilityAssignmentsResponse>(EMPTY_ASSIGNMENTS);
  const [activeFacilityTab, setActiveFacilityTab] = useState<FacilityTab>("active");
  const [showAssignFacilityModal, setShowAssignFacilityModal] = useState(false);
  const [showCreateFacilityModal, setShowCreateFacilityModal] = useState(false);

  useEffect(() => {
    async function fetchApplicant() {
      if (!applicantId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(
          `/api/admin/worker-profile?workerId=${encodeURIComponent(applicantId)}`
        );
        const json = (await res.json()) as WorkerProfileResponse & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || `Failed to load profile (${res.status})`);
        }
        setProfile(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Failed to fetch applicant for facility assignments:", msg, e);
        setLoadError(msg);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    }

    fetchApplicant();
  }, [applicantId]);

  const loadFacilities = useCallback(async () => {
    if (!applicantId) return;
    setFacilitiesLoading(true);
    setFacilitiesError(null);
    try {
      const res = await fetch(
        `/api/admin/facility-assignments?workerId=${encodeURIComponent(applicantId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as FacilityAssignmentsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(FACILITIES_LOAD_ERROR);
      }
      if (process.env.NODE_ENV !== "production") {
        console.info("[FacilityAssignments] loaded", {
          applicantId,
          tenantId: json.meta?.tenantId,
          totalTenantFacilities: json.meta?.totalTenantFacilities,
          assignedCount: json.meta?.assignedCount,
          unassignedCount: json.meta?.unassignedCount,
          potentialIds: json.potential?.map((item) => item.id),
        });
      }
      setAssignments({
        ...json,
        meta: json.meta ?? EMPTY_ASSIGNMENTS.meta,
      });
    } catch (e) {
      console.error("Failed to fetch facility assignments:", e);
      setFacilitiesError(FACILITIES_LOAD_ERROR);
    } finally {
      setFacilitiesLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    void loadFacilities();
  }, [loadFacilities]);

  const applicant = profile?.worker ?? null;

  const candidateName = useMemo(() => {
    const n = `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim();
    return n || "Applicant";
  }, [applicant]);

  const candidateRole = applicant?.job_role || "N/A";

  const visibleFacilities = useMemo(() => {
    if (activeFacilityTab === "active") return assignments.active;
    if (activeFacilityTab === "recent") return assignments.recent;
    return assignments.potential;
  }, [activeFacilityTab, assignments]);

  const hasVisibleFacilities = visibleFacilities.length > 0;
  const emptyStateCopy = getEmptyStateCopy(activeFacilityTab);
  const showMainContent = !loading && !facilitiesLoading;

  function facilityCardVariant(): "default" | "assigned" | "recent" {
    if (activeFacilityTab === "active") return "assigned";
    if (activeFacilityTab === "recent") return "recent";
    return "default";
  }

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
            <div className="font-semibold text-2xl">New Applicant</div>
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
            <DetailedTabs applicantId={applicantId} activeTab="Facility Assignments" />

            {loadError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {loadError}
              </div>
            ) : null}

            {facilitiesError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {facilitiesError}
              </div>
            ) : null}

            {loading || facilitiesLoading ? (
              <CandidateDetailLoader label="Loading facility assignments..." />
            ) : (
              <>
                <DetailedCandidateHeader
                  name={candidateName}
                  role={candidateRole}
                  profilePhotoUrl={applicant?.profile_photo_url}
                  workerId={applicantId}
                  candidateEmail={applicant?.email ?? null}
                />

                <div className="flex w-full min-w-0 admin-recruiter-content-width flex-col">
                  <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-end">
                    {showMainContent ? (
                      <div className="order-1 flex justify-end xl:order-3 xl:pb-1">
                        <FacilityActionButtons
                          layout="row"
                          onCreate={() => setShowCreateFacilityModal(true)}
                          onAssign={() => setShowAssignFacilityModal(true)}
                        />
                      </div>
                    ) : (
                      <div className="hidden xl:block" />
                    )}
                    <div className="order-2 xl:order-1 hidden xl:block" />
                    <div className="candidate-detail-tabs-scroll order-3 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 xl:order-2">
                      <UnderlineTabBar
                        tabs={FACILITY_TABS}
                        activeTab={activeFacilityTab}
                        onTabChange={setActiveFacilityTab}
                        ariaLabel="Facility sections"
                        align="center"
                        className="border-b-0 max-md:mx-auto max-md:w-max"
                      />
                    </div>
                  </div>

                  {hasVisibleFacilities ? (
                    <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-white p-5">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {visibleFacilities.map((facility) => (
                          <FacilityCard
                            key={facility.id}
                            facility={facility}
                            variant={facilityCardVariant()}
                          />
                        ))}
                      </div>
                    </div>
                  ) : emptyStateCopy ? (
                    <div className="mt-4 flex min-h-[calc(100dvh-22rem)] items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-6 py-10">
                      <div className="max-w-md text-center">
                        <div className="text-[18px] font-semibold leading-7 text-gray-700">
                          {emptyStateCopy.title}
                        </div>
                        <div className="mt-2 text-center text-sm font-normal leading-5 text-gray-500">
                          {emptyStateCopy.description}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showCreateFacilityModal && applicantId ? (
        <CreateFacilityModal
          open={showCreateFacilityModal}
          workerId={applicantId}
          onClose={() => setShowCreateFacilityModal(false)}
          onSuccess={({ assigned }) => {
            void loadFacilities();
            setActiveFacilityTab(assigned ? "active" : "potential");
          }}
          onAssignExisting={async (facilityId) => {
            const res = await fetch("/api/admin/facility-assignments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workerId: applicantId, facilityId }),
            });
            const json = (await res.json().catch(() => ({}))) as {
              error?: string;
              alreadyAssigned?: boolean;
            };
            if (!res.ok) {
              throw new Error(json.error || "Failed to assign facility.");
            }
            toast.success(
              json.alreadyAssigned
                ? "Facility is already assigned to this candidate."
                : "Facility assigned successfully."
            );
            setActiveFacilityTab("active");
            await loadFacilities();
          }}
        />
      ) : null}

      {showAssignFacilityModal && applicantId ? (
        <AssignFacilityModal
          open={showAssignFacilityModal}
          workerId={applicantId}
          onClose={() => setShowAssignFacilityModal(false)}
          onAssigned={async () => {
            setActiveFacilityTab("active");
            await loadFacilities();
          }}
        />
      ) : null}
    </div>
  );
}
