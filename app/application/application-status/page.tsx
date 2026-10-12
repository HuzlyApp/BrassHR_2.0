"use client";

import { applicationPath } from "@/lib/tenant/with-tenant";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  APPLICANT_SHELL_TALL_CLASS,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import ApplicantRecruiterNotes from "@/app/application/components/ApplicantRecruiterNotes";
import type { ApplicationStatusKey } from "@/lib/applicant-portal";
import { sendApplicationSubmissionEmail } from "@/lib/onboarding/send-application-submission-email";
import PreHireCompletionView from "@/app/application/components/completion/PreHireCompletionView";
import PostHireCompletionView from "@/app/application/components/completion/PostHireCompletionView";
import type { WorkflowCompletionResult } from "@/lib/onboarding/workflow-completion-check";

type ApplicationStatusResponse = {
  applicationStatus?: ApplicationStatusKey;
  statusLabel?: string;
  submittedAt?: string;
};

function formatSubmittedDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", 
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  }
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadgeClass(status: ApplicationStatusKey): string {
  if (status === "approved") return "bg-[#2ec9b5]";
  if (status === "rejected") return "bg-[#ef4444]";
  if (status === "under_review") return "bg-[#3b82f6]";
  return "bg-[#f59e0b]";
}

function statusIconSrc(status: ApplicationStatusKey): string {
  return status === "approved" ? "/icons/approved.svg" : "/icons/pending.svg";
}

function statusHeading(status: ApplicationStatusKey): string {
  if (status === "approved") return "Application Approved";
  if (status === "rejected") return "Application Not Approved";
  if (status === "under_review") return "Application Under Review";
  return "Application Submitted";
}

function statusDescription(status: ApplicationStatusKey): string {
  if (status === "approved") {
    return "Congratulations! Your application was approved. We also sent you an email about your status and next steps.";
  }
  if (status === "rejected") {
    return "Your application was not approved at this time. Check your email or recruiter notes below for more information.";
  }
  if (status === "under_review") {
    return "Your application is under review. We will email you when there is an update.";
  }
  return "Current status is pending and we will provide updates within 48 hours. You can return here anytime to check your status—we will also email you about verification updates.";
}

export default function ApplicationStatusPage() {
  const searchParams = useSearchParams();
  const branding = useTenantBranding();
  const emailSentRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [applicationStatus, setApplicationStatus] = useState<ApplicationStatusKey>("pending");
  const [statusLabel, setStatusLabel] = useState("Pending");
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [completionResult, setCompletionResult] = useState<WorkflowCompletionResult | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const applicantId =
        typeof window !== "undefined" ? localStorage.getItem("applicantId")?.trim() || "" : "";
      if (!applicantId) {
        if (alive) {
          setSubmittedAt(new Date().toISOString());
          setLoading(false);
        }
        return;
      }

      try {
        const tenant = searchParams.get("tenant")?.trim() || "";
        const [statusRes, compRes] = await Promise.allSettled([
          fetch(
            `/api/onboarding/application-status?applicantId=${encodeURIComponent(applicantId)}`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/onboarding/completion-status?applicantId=${encodeURIComponent(applicantId)}${
              tenant ? `&tenant=${encodeURIComponent(tenant)}` : ""
            }`,
            { cache: "no-store" }
          ),
        ]);

        if (!alive) return;

        if (statusRes.status === "fulfilled" && statusRes.value.ok) {
          const data = (await statusRes.value.json()) as ApplicationStatusResponse;
          setApplicationStatus(data.applicationStatus ?? "pending");
          setStatusLabel(data.statusLabel ?? "Pending");
          setSubmittedAt(data.submittedAt ?? new Date().toISOString());
        } else {
          setSubmittedAt(new Date().toISOString());
        }

        if (compRes.status === "fulfilled" && compRes.value.ok) {
          const compData = (await compRes.value.json()) as WorkflowCompletionResult;
          setCompletionResult(compData);
        }
      } catch {
        if (alive) setSubmittedAt(new Date().toISOString());
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [searchParams]);

  useEffect(() => {
    if (emailSentRef.current) return;
    const applicantId = localStorage.getItem("applicantId")?.trim();
    if (!applicantId) return;
    emailSentRef.current = true;

    void fetch("/api/onboarding/continuation-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    }).catch(() => {
      /* best-effort tracking only */
    });

    void sendApplicationSubmissionEmail(applicantId).catch(() => {
      /* best-effort; status page still renders */
    });
  }, []);

  const isApproved = applicationStatus === "approved";
  const submittedDateLabel = formatSubmittedDate(submittedAt);
  const completion = searchParams.get("completion");
  const isExplicitPreHire = completion === "pre_hire";
  const isExplicitPostHire = completion === "post_hire";

  const showPostHireCompleted =
    isExplicitPostHire ||
    (!isExplicitPreHire && completionResult?.allComplete === true);

  const showPreHireCompleted =
    isExplicitPreHire ||
    (!isExplicitPostHire &&
      completionResult?.preHire?.isComplete === true &&
      !completionResult?.postHire?.isComplete);

  if (showPostHireCompleted) {
    return (
      <OnboardingLayout
        cardClassName="min-[700px]:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)] min-[1200px]:grid-cols-[minmax(0,1.65fr)_minmax(220px,1fr)]"
        rightPanelImageClassName="object-cover object-center grayscale opacity-60"
        rightPanelOverlayClassName="bg-white/65"
      >
        <PostHireCompletionView completionResult={completionResult} />
      </OnboardingLayout>
    );
  }

  if (showPreHireCompleted) {
    return (
      <OnboardingLayout
        cardClassName="min-[700px]:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)] min-[1200px]:grid-cols-[minmax(0,1.65fr)_minmax(220px,1fr)]"
        rightPanelImageClassName="object-cover object-center grayscale opacity-60"
        rightPanelOverlayClassName="bg-white/65"
      >
        <PreHireCompletionView completionResult={completionResult} />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      cardClassName="min-[700px]:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)] min-[1200px]:grid-cols-[minmax(0,1.65fr)_minmax(220px,1fr)]"
      rightPanelImageClassName="object-cover object-center grayscale opacity-60"
      rightPanelOverlayClassName="bg-white/65"
      rightPanelContentClassName="p-5"
      rightPanelInnerClassName="max-w-[300px] gap-8"
      logoClassName="h-[72px] w-[240px]"
      taglineClassName="max-w-[300px] text-[15px] leading-8 text-slate-900"
    >
      <div className={APPLICANT_SHELL_TALL_CLASS}>
        <div className="flex flex-1 flex-col gap-6 sm:gap-9">
          <h1 className={`${APPLICANT_TITLE_CLASS} text-slate-900`}>
            {isApproved ? "Application Submitted" : "Verification Status"}
          </h1>

          <div className="flex w-full flex-col gap-5 sm:h-[486px]">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Image
                    src={statusIconSrc(applicationStatus)}
                    alt={`${statusLabel} status`}
                    width={30}
                    height={30}
                    className="h-[30px] w-[30px] shrink-0"
                  />
                  <span className="truncate text-base font-semibold leading-6 text-slate-900 sm:text-[18px] sm:leading-7">
                    {loading ? "Loading..." : statusLabel}
                  </span>
                </div>

                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[13px] font-medium leading-5 text-white sm:min-h-9 sm:px-4 sm:text-[14px] ${statusBadgeClass(applicationStatus)}`}
                >
                  {loading ? "..." : statusLabel}
                </span>
              </div>

              <div className="flex flex-1 flex-col px-3 pb-5 pt-4 sm:px-4 sm:pb-6 sm:pt-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <h2 className="text-base font-semibold leading-6 text-slate-900 sm:text-[20px] sm:leading-7">
                    {statusHeading(applicationStatus)}
                  </h2>
                  <time
                    className="text-[14px] font-normal leading-5 text-slate-500"
                    dateTime={submittedAt ?? undefined}
                  >
                    {loading ? "..." : submittedDateLabel}
                  </time>
                </div>

                {isApproved ? (
                  <div className="mt-4 max-w-[500px] space-y-5 text-[16px] font-normal leading-6 text-slate-700">
                    <ApplicantRecruiterNotes title="Message from recruiter" />
                    <p>
                      <span className="font-semibold text-slate-900">Congratulations!</span> Your
                      application was approved.
                      <br />
                      You can now claim a shift. Click the button below to browse a shift.
                    </p>
                    <p>{statusDescription(applicationStatus)}</p>
                  </div>
                ) : (
                  <div className="mt-4 max-w-[500px] space-y-5 text-[16px] font-normal leading-6 text-slate-700">
                    <ApplicantRecruiterNotes
                      title="What you need to do"
                      emptyMessage="Your application is pending. Your recruiter will add instructions here when needed."
                    />
                    <p>{statusDescription(applicationStatus)}</p>
                  </div>
                )}
              </div>
            </section>

            <div className="flex justify-end">
              {isApproved ? (
                <Link
                  href={applicationPath("/application/employee-agreement")}
                  className="inline-flex min-w-[185px] h-11 items-center justify-center gap-2 rounded-lg bg-[#0ea5a4] px-4 py-2.5 text-[16px] font-semibold leading-6 text-white transition hover:bg-[#0c8d8b]"
                >
                  Sign Employee Agreement
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex h-11 w-[150px] cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-[16px] font-semibold leading-6 text-slate-400 opacity-70"
                >
                  Browse Shift
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}
