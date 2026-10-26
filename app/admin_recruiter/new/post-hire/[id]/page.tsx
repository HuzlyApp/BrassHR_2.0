"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import HireJourneyClient from "@/app/admin_recruiter/candidates/[workerId]/hire-journey/HireJourneyClient";
import type { CandidateWorkflowPhaseView } from "@/lib/onboarding/candidate-workflow-phase-view";

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

  return (
    <div className="admin-recruiter-page-pad">
      <div className="admin-recruiter-content-width">
        <DetailedTabs
          applicantId={applicantId}
          activeTab="Post-Hire"
          workerStatus={worker?.status}
          workflowView={view}
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <DetailedCandidateHeader
          name={name}
          role={worker?.job_role ?? ""}
          loading={loading && !profile}
          profilePhotoUrl={worker?.profile_photo_url}
          workerId={applicantId}
          candidateEmail={worker?.email}
        />

        {loading && !view && !error ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-6 text-sm text-[#667085]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading hiring journey…
          </div>
        ) : null}

        {applicantId && view?.postHireVisible ? (
          <Suspense
            fallback={
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-6 text-sm text-[#667085]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading hiring journey…
              </div>
            }
          >
            <HireJourneyClient workerId={applicantId} embeddedPhase="post_hire" />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
