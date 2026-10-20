"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateWorkflowPhasePanel from "../../../components/CandidateWorkflowPhasePanel";
import type { CandidateWorkflowPhaseView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { PRE_HIRE_UNASSIGNED_MESSAGE } from "@/lib/onboarding/assigned-workflow-steps";

type ProfilePayload = {
  worker?: {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    job_role?: string | null;
    status?: string | null;
    status_label?: string | null;
    profile_photo_url?: string | null;
    email?: string | null;
  };
  error?: string;
};

export default function CandidatePreHirePage() {
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [view, setView] = useState<CandidateWorkflowPhaseView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applicantId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, phaseRes] = await Promise.all([
        fetch(`/api/admin/worker-profile?workerId=${encodeURIComponent(applicantId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/candidates/${encodeURIComponent(applicantId)}/workflow-phases`, {
          cache: "no-store",
        }),
      ]);
      const profileJson = (await profileRes.json()) as ProfilePayload;
      const phaseJson = (await phaseRes.json()) as CandidateWorkflowPhaseView & { error?: string };
      if (!profileRes.ok) throw new Error(profileJson.error || "Failed to load candidate");
      if (!phaseRes.ok) throw new Error(phaseJson.error || "Failed to load Pre-Hire workflow");
      setProfile(profileJson);
      setView(phaseJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Pre-Hire workflow");
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const worker = profile?.worker;
  const name = `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim();

  return (
    <div className="admin-recruiter-page-pad">
      <div className="admin-recruiter-content-width">
        <DetailedCandidateHeader
          name={name}
          role={worker?.job_role ?? ""}
          status={worker?.status_label ?? worker?.status ?? undefined}
          loading={loading && !profile}
          profilePhotoUrl={worker?.profile_photo_url}
          workerId={applicantId}
          candidateEmail={worker?.email}
        />
        <DetailedTabs
          applicantId={applicantId}
          activeTab="Pre-Hire"
          workerStatus={worker?.status}
          workflowView={view}
        />
        <CandidateWorkflowPhasePanel
          workerId={applicantId}
          phase="pre_hire"
          assigned={view?.preHire.assigned ?? false}
          loading={loading && !view}
          error={error}
          progress={view?.preHire.progress ?? { complete: 0, total: 0, percent: 0, label: "0 / 0 Pre-Hire completed" }}
          steps={view?.preHire.steps ?? []}
          documents={view?.preHire.documents ?? []}
          assignment={view?.preHire.assignment}
          emptyAssignedMessage={PRE_HIRE_UNASSIGNED_MESSAGE}
          onWorkflowChanged={() => void load()}
        />
      </div>
    </div>
  );
}
