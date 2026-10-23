"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import BrandedHistoryIcon from "../../../components/BrandedHistoryIcon";

type ProfilePayload = {
  worker?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    job_role?: string | null;
    status_label?: string | null;
    profile_photo_url?: string | null;
  };
  activity?: {
    created_at?: string | null;
    updated_at?: string | null;
  };
  activity_history?: Array<{
    id?: string | null;
    action?: string | null;
    created_at?: string | null;
  }>;
  error?: string;
};

type ChecklistPayload = {
  activity_history?: Array<{
    id?: string | null;
    action?: string | null;
    created_at?: string | null;
  }>;
  error?: string;
};

type HistoryItem = {
  id: string;
  action: string;
  ago: string;
  date: string;
  time: string;
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return days === 1 ? "1 day ago" : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

function formatDateTimeParts(iso: string): { dateLine: string; timeLine: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { dateLine: "—", timeLine: "—" };
  }
  return {
    dateLine: d.toLocaleDateString("en-US", { timeZone: "America/New_York", 
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    timeLine: d.toLocaleTimeString("en-US", { timeZone: "America/New_York", 
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function buildHistoryItems(
  profile: ProfilePayload | null,
  checklist: ChecklistPayload | null
): HistoryItem[] {
  const logs = checklist?.activity_history?.length
    ? checklist.activity_history
    : profile?.activity_history ?? [];

  const withTime = logs.filter((entry) => entry.created_at?.trim());
  if (withTime.length > 0) {
    return withTime.map((entry, index) => {
      const at = entry.created_at!.trim();
      const { dateLine, timeLine } = formatDateTimeParts(at);
      return {
        id: entry.id ?? `activity-${index}`,
        action: entry.action?.trim() || "Activity",
        ago: formatRelative(at),
        date: dateLine,
        time: timeLine,
      };
    });
  }

  const activity = profile?.activity;
  const rows: Array<{ id: string; action: string; at: string }> = [];
  if (activity?.created_at?.trim()) {
    rows.push({
      id: "created",
      action: "Applicant record created",
      at: activity.created_at.trim(),
    });
  }
  if (activity?.updated_at?.trim()) {
    const updated = activity.updated_at.trim();
    const created = activity.created_at?.trim();
    if (!created || updated !== created) {
      rows.push({
        id: "updated",
        action: "Applicant profile updated",
        at: updated,
      });
    }
  }

  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return rows.map((row) => {
    const { dateLine, timeLine } = formatDateTimeParts(row.at);
    return {
      id: row.id,
      action: row.action,
      ago: formatRelative(row.at),
      date: dateLine,
      time: timeLine,
    };
  });
}

export default function NewApplicantHistoryPage() {
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [checklist, setChecklist] = useState<ChecklistPayload | null>(null);

  useEffect(() => {
    async function fetchApplicant() {
      if (!applicantId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const [profileRes, checklistRes] = await Promise.all([
          fetch(`/api/admin/worker-profile?workerId=${encodeURIComponent(applicantId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/worker-checklist?workerId=${encodeURIComponent(applicantId)}`, {
            cache: "no-store",
          }),
        ]);

        const profileJson = (await profileRes.json()) as ProfilePayload;
        const checklistJson = (await checklistRes.json()) as ChecklistPayload;

        if (!profileRes.ok) {
          throw new Error(profileJson.error || `Failed to load profile (${profileRes.status})`);
        }
        if (!checklistRes.ok) {
          throw new Error(checklistJson.error || `Failed to load checklist (${checklistRes.status})`);
        }

        setProfile(profileJson);
        setChecklist(checklistJson);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load history";
        setLoadError(message);
        setProfile(null);
        setChecklist(null);
      } finally {
        setLoading(false);
      }
    }

    void fetchApplicant();
  }, [applicantId]);

  const applicant = profile?.worker ?? null;

  const candidateName = useMemo(() => {
    const name = `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim();
    return name || "Applicant";
  }, [applicant]);

  const candidateRole = applicant?.job_role || "N/A";

  const historyItems = useMemo(
    () => buildHistoryItems(profile, checklist),
    [profile, checklist]
  );

  return (
    <div className="admin-recruiter-page-pad">
      <div className="admin-recruiter-content-width">
        <DetailedTabs applicantId={applicantId} activeTab="History" />

        {loadError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        ) : null}

        {loading ? (
          <CandidateDetailLoader label="Loading history..." />
        ) : (
          <>
            <DetailedCandidateHeader
              name={candidateName}
              role={candidateRole}
              profilePhotoUrl={applicant?.profile_photo_url ?? undefined}
              workerId={applicantId}
              candidateEmail={applicant?.email ?? null}
            />

            <div className="rounded-xl border border-[#D1D5DB] bg-white p-5 shadow-sm">
              <div className="mb-4 text-sm font-semibold text-[#374151]">
                Actions taken{" "}
                <span className="font-semibold text-[#111827]">{historyItems.length}</span>
              </div>

              {historyItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#D1D5DB] px-6 py-10 text-center text-sm text-[#6B7280]">
                  No history events yet.
                </div>
              ) : (
                <div className="space-y-0">
                  {historyItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1 border-b border-[#E5E7EB] py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <BrandedHistoryIcon className="h-[30px] w-[30px] shrink-0" />
                        <div className="min-w-0 break-words text-sm text-[#4B5563] sm:truncate">{item.action}</div>
                      </div>
                      <div className="shrink-0 pl-[42px] text-xs text-[#6B7280] sm:pl-0">
                        {item.ago} <span>•</span> {item.date} <span>•</span> {item.time}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
