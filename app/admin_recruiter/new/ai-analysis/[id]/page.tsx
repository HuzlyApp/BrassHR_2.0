"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import { CandidatesAiAnalysisClient } from "@/app/admin_recruiter/candidates/ai-analysis/[workerId]/CandidatesAiAnalysisClient";
import { candidateProfileHref } from "@/app/admin_recruiter/candidates/candidate-links";

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

function AiAnalysisTabContent({ applicantId }: { applicantId: string }) {
  return (
    <CandidatesAiAnalysisClient
      workerId={applicantId}
      backHref={candidateProfileHref(applicantId)}
      embedded
    />
  );
}

export default function CandidateDetailAiAnalysisPage() {
  const params = useParams<{ id: string }>();
  const applicantId = params?.id?.trim() ?? "";
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/worker-profile?workerId=${encodeURIComponent(applicantId)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as ProfilePayload;
        if (!res.ok) throw new Error(json.error || "Failed to load candidate");
        if (!cancelled) setProfile(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load candidate");
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [applicantId]);

  const worker = profile?.worker;
  const name = `${worker?.first_name ?? ""} ${worker?.last_name ?? ""}`.trim();

  if (!applicantId) {
    return (
      <div className="admin-recruiter-page-pad">
        <div className="admin-recruiter-content-width rounded-xl border border-[#E5E7EB] bg-white px-4 py-6 text-sm text-[#667085]">
          Missing candidate id.
        </div>
      </div>
    );
  }

  return (
    <div className="admin-recruiter-page-pad">
      <div className="admin-recruiter-content-width">
        <DetailedTabs applicantId={applicantId} activeTab="AI Analysis" />

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loading && !profile ? (
          <CandidateDetailLoader label="Loading candidate..." />
        ) : (
          <>
            <DetailedCandidateHeader
              name={name}
              role={worker?.job_role ?? ""}
              status={worker?.status_label ?? worker?.status ?? undefined}
              profilePhotoUrl={worker?.profile_photo_url}
              workerId={applicantId}
              candidateEmail={worker?.email}
              aiAnalysisHref={null}
            />
            <Suspense
              fallback={
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-6 text-sm text-[#667085]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading AI analysis…
                </div>
              }
            >
              <AiAnalysisTabContent applicantId={applicantId} />
            </Suspense>
          </>
        )}
      </div>
    </div>
  );
}
