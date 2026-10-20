"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateWorkflowPhasePanel from "../../../components/CandidateWorkflowPhasePanel";
import type { CandidateWorkflowPhaseView } from "@/lib/onboarding/candidate-workflow-phase-view";
import { POST_HIRE_UNASSIGNED_MESSAGE } from "@/lib/onboarding/assigned-workflow-steps";
import { countsForPhase } from "@/lib/onboarding/workflow-phase-groups";

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

export default function CandidatePostHirePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
        fetch(
          `/api/admin/candidates/${encodeURIComponent(applicantId)}/workflow-phases?phase=post_hire`,
          { cache: "no-store" }
        ),
      ]);
      const profileJson = (await profileRes.json()) as ProfilePayload;
      const phaseJson = (await phaseRes.json()) as CandidateWorkflowPhaseView & {
        error?: string;
        code?: string;
      };
      if (!profileRes.ok) throw new Error(profileJson.error || "Failed to load candidate");
      setProfile(profileJson);
      if (phaseRes.status === 403) {
        router.replace(`/admin_recruiter/new/pre-hire/${applicantId}`);
        return;
      }
      if (!phaseRes.ok) throw new Error(phaseJson.error || "Failed to load Post-Hire workflow");
      if (!phaseJson.postHireVisible) {
        router.replace(`/admin_recruiter/new/pre-hire/${applicantId}`);
        return;
      }
      setView(phaseJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Post-Hire workflow");
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const worker = profile?.worker;
  const name = `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim();
  const postHire = view?.postHire ?? null;

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
          activeTab="Post-Hire"
          workerStatus={worker?.status}
          workflowView={view}
        />
        <CandidateWorkflowPhasePanel
          workerId={applicantId}
          phase="post_hire"
          assigned={postHire?.assigned ?? false}
          loading={loading && !view}
          error={error}
          progress={postHire?.progress ?? countsForPhase(0, 0, "post_hire")}
          steps={postHire?.steps ?? []}
          documents={postHire?.documents ?? []}
          assignment={postHire?.assignment}
          emptyAssignedMessage={POST_HIRE_UNASSIGNED_MESSAGE}
          activationFailed={Boolean(view?.postHireVisible && view.postHireActivationFailed)}
          onWorkflowChanged={() => void load()}
        />
      </div>
    </div>
  );
}
