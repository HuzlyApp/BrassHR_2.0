"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HireStageBoard } from "@/app/admin_recruiter/components/hire-stage/HireStageBoard";
import { HireJourneyThemeProvider } from "@/app/admin_recruiter/components/hire-stage/HireJourneyTheme";
import { dispatchCandidatePipelineRefresh } from "@/lib/admin/candidate-pipeline-events";
import type { HireStageSidebarProfile } from "@/app/admin_recruiter/components/hire-stage/HireStageSidebar";
import type { CandidateProfilePayload } from "@/lib/admin/candidate-profile-view";
import { workTypeSummaryLabel } from "@/lib/admin/candidate-profile-view";
import {
  POST_HIRE_UNASSIGNED_MESSAGE,
  PRE_HIRE_UNASSIGNED_MESSAGE,
} from "@/lib/onboarding/assigned-workflow-steps";
import type { CandidateWorkflowPhaseView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { POST_HIRE_LOCKED_TAB_MESSAGE, EMPLOYMENT_JOURNEY_STAGES } from "@/lib/onboarding/workflow-phase-groups";

type HireTab = "pre_hire" | "post_hire";

/** Picks up candidate-side progress (e.g. a submitted form) without a page reload. */
const BACKGROUND_REFRESH_MS = 30_000;

function formatAppliedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildSidebarProfile(
  profile: CandidateProfilePayload | null,
  view: CandidateWorkflowPhaseView | null
): HireStageSidebarProfile & { email?: string | null; phone?: string | null } {
  const candidate = profile?.candidate;
  const primaryApp = profile?.applications?.[0] ?? null;
  const workTypeRaw = primaryApp?.workType || profile?.workTypeSummary?.[0]?.key || null;

  // Prefer the specific application status, then overall dynamic status, then candidate fallback
  const statusLabel = primaryApp?.statusName 
    || profile?.stats?.overallStatus 
    || candidate?.statusLabel 
    || candidate?.status 
    || null;

  return {
    name: candidate?.name?.trim() || "Candidate",
    role: candidate?.role?.trim() || primaryApp?.jobTitle?.trim() || "",
    statusLabel,
    photoUrl: candidate?.profilePhotoUrl ?? null,
    workType: workTypeRaw ? workTypeSummaryLabel(workTypeRaw) : null,
    department: primaryApp?.companyName?.trim() || null,
    location: candidate?.location?.trim() || null,
    source: null,
    dateApplied: formatAppliedDate(primaryApp?.appliedAt),
    email: candidate?.email ?? null,
    phone: candidate?.phone ?? null,
  };
}

export default function HireJourneyClient({
  workerId,
  embeddedPhase,
}: {
  workerId: string;
  /** Render inside a candidate detail tab. Hides the standalone page chrome and phase pills. */
  embeddedPhase?: HireTab;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = embeddedPhase ?? (searchParams.get("tab") === "post_hire" ? "post_hire" : "pre_hire");
  const [tab, setTab] = useState<HireTab>(initialTab);
  const embedded = embeddedPhase != null;
  const [profile, setProfile] = useState<CandidateProfilePayload | null>(null);
  const [view, setView] = useState<CandidateWorkflowPhaseView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!workerId) return;
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [profileRes, phaseRes] = await Promise.all([
        fetch(`/api/admin/candidates/${encodeURIComponent(workerId)}/profile`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/candidates/${encodeURIComponent(workerId)}/workflow-phases`, {
          cache: "no-store",
        }),
      ]);

      const profileJson = (await profileRes.json()) as CandidateProfilePayload & {
        error?: string;
      };
      const phaseJson = (await phaseRes.json()) as CandidateWorkflowPhaseView & {
        error?: string;
      };

      if (!profileRes.ok) {
        throw new Error(profileJson.error || "Failed to load candidate profile");
      }
      if (!phaseRes.ok) {
        throw new Error(phaseJson.error || "Failed to load hire workflow");
      }

      setProfile(profileJson);
      setView(phaseJson);
    } catch (err) {
      if (silent) {
        console.warn("[hire-journey] background refresh failed", err);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load hire journey");
      setView(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    const timer = window.setInterval(refreshIfVisible, BACKGROUND_REFRESH_MS);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [load]);

  useEffect(() => {
    if (embeddedPhase) return;
    const next = searchParams.get("tab") === "post_hire" ? "post_hire" : "pre_hire";
    setTab(next);
  }, [embeddedPhase, searchParams]);

  const openPostHireTab = useCallback(() => {
    if (embedded) {
      router.push(`/admin_recruiter/new/post-hire/${encodeURIComponent(workerId)}`);
      return;
    }
    setTab("post_hire");
  }, [embedded, router, workerId]);

  const refreshJourney = useCallback(async () => {
    await load({ silent: true });
    if (embedded) dispatchCandidatePipelineRefresh(workerId);
  }, [embedded, load, workerId]);

  const sidebarProfile = useMemo(() => buildSidebarProfile(profile, view), [profile, view]);
  const primaryApplication = profile?.applications?.[0] ?? null;
  const postHireVisible = Boolean(view?.postHireVisible);
  const postHireBlock = view?.postHire ?? null;
  const workflowHasPostHire = view ? view.workflowHasPostHireSteps : true;
  const activeTab: HireTab = embeddedPhase
    ? embeddedPhase
    : workflowHasPostHire
      ? tab
      : "pre_hire";

  function selectTab(next: HireTab) {
    if (next === "post_hire" && (!workflowHasPostHire || (!postHireVisible && !loading))) {
      return;
    }
    setTab(next);
  }

  const board =
    activeTab === "post_hire" ? (
      !postHireVisible ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-800">
          {POST_HIRE_LOCKED_TAB_MESSAGE}
        </div>
      ) : (
        <HireStageBoard
          workerId={workerId}
          lifecycle="post_hire"
          loading={loading}
          error={error}
          assigned={postHireBlock?.assigned ?? false}
          emptyMessage={POST_HIRE_UNASSIGNED_MESSAGE}
          steps={postHireBlock?.steps ?? []}
          assignment={postHireBlock?.assignment}
          phaseView={view}
          profile={sidebarProfile}
          activationFailed={Boolean(view?.postHireActivationFailed)}
          applicationId={primaryApplication?.id}
          jobTitle={primaryApplication?.jobTitle}
          onScheduled={() => refreshJourney()}
          onWorkflowChanged={() => refreshJourney()}
        />
      )
    ) : (
      <HireStageBoard
        workerId={workerId}
        lifecycle="pre_hire"
        loading={loading}
        error={error}
        assigned={view?.preHire.assigned ?? false}
        emptyMessage={PRE_HIRE_UNASSIGNED_MESSAGE}
        steps={view?.preHire.steps ?? []}
        assignment={view?.preHire.assignment}
        phaseView={view}
        profile={sidebarProfile}
        applicationId={primaryApplication?.id}
        jobTitle={primaryApplication?.jobTitle}
        onScheduled={() => refreshJourney()}
        onWorkflowChanged={() => refreshJourney()}
        onRequestPostHireTab={openPostHireTab}
        onPostHireActivated={async () => {
          await refreshJourney();
          openPostHireTab();
        }}
      />
    );

  if (embedded) {
    return <div className="space-y-4">{board}</div>;
  }

  return (
    <HireJourneyThemeProvider>
    <div className="admin-recruiter-page-pad bg-[#F5F6F8]">
      <div className="admin-recruiter-content-width space-y-4">
        {workflowHasPostHire ? (
        <div className="flex w-full justify-center">
          <div
            className="inline-flex rounded-full border border-[#E5E7EB] bg-white p-1 shadow-sm"
            role="tablist"
            aria-label="Hire phase"
          >
            {(
              [
                { id: "pre_hire" as const, label: "Pre Hire" },
                { id: "post_hire" as const, label: "Post Hire" },
              ] as const
            ).map((item) => {
              const active = activeTab === item.id;
              const postLocked = item.id === "post_hire" && !postHireVisible && !loading;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-disabled={postLocked}
                  title={postLocked ? POST_HIRE_LOCKED_TAB_MESSAGE : undefined}
                  onClick={() => selectTab(item.id)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                    active
                      ? "text-white shadow-sm"
                      : postLocked
                        ? "cursor-not-allowed text-[#CBD5E1]"
                        : "text-[#64748B]"
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: "var(--brand-primary)",
                        }
                      : undefined
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        ) : null}

        {board}
      </div>
    </div>
    </HireJourneyThemeProvider>
  );
}
