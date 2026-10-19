"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  TenantOnboardingConfig,
  TenantOnboardingStep,
  WorkerOnboardingProgressPayload,
  OnboardingStepStatus,
} from "@/lib/onboarding/types";
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug";
import { usePathname, useSearchParams } from "next/navigation";
import { applyApplicantConfigFilters } from "@/lib/onboarding/filter-applicant-steps";
import { readOnboardingPreview } from "@/lib/onboarding/onboarding-preview-storage";
import { computeMaxAllowedStepIndex, getEnabledTenantSteps } from "@/lib/onboarding/tenant-step-navigation";
import { computeCandidateOnboardingFrontier } from "@/lib/onboarding/candidate-onboarding-projection";
import { safeFetchJson } from "@/lib/api/safe-fetch-json";
import { useApplicantSession } from "@/lib/onboarding/applicant-session-context";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import { currentApplicationJobToken, rememberApplicationJobToken } from "@/lib/tenant/with-tenant";
import type { ApplicantLifecyclePhase } from "@/lib/onboarding/workflow-phase";

export type OnboardingConfigSource =
  | "published"
  | "job-workflow"
  | "worker-onboarding"
  | "draft-preview"
  | "draft-api"
  | null;

type Ctx = {
  config: TenantOnboardingConfig | null;
  progress: WorkerOnboardingProgressPayload | null;
  loading: boolean;
  loadingConfig: boolean;
  loadingProgress: boolean;
  progressHydrated: boolean;
  error: string | null;
  source: OnboardingConfigSource;
  isDraftPreview: boolean;
  applicantId: string | null;
  applicationId: string | null;
  workflowPhase: ApplicantLifecyclePhase;
  allWorkflowSteps?: TenantOnboardingStep[];
  refresh: () => Promise<void>;
  updateStepStatus: (
    stepKey: string,
    status: OnboardingStepStatus,
    data?: Record<string, unknown>,
    stepId?: string
  ) => Promise<void>;
  maxAllowedStepIndex: number;
  waitingOnInternal: boolean;
};

const OnboardingConfigContext = createContext<Ctx | null>(null);

export function useOnboardingConfig() {
  const ctx = useContext(OnboardingConfigContext);
  if (!ctx) {
    throw new Error("useOnboardingConfig must be used within OnboardingConfigProvider");
  }
  return ctx;
}

export function useOnboardingConfigOptional() {
  return useContext(OnboardingConfigContext);
}

function readApplicantId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("applicantId")?.trim() || null;
  } catch {
    return null;
  }
}

const PROGRESS_STATUS_RANK: Record<OnboardingStepStatus, number> = {
  pending: 0,
  in_progress: 1,
  failed: 2,
  skipped: 3,
  completed: 4,
};

/** Keep the furthest-along status per step when a stale progress fetch returns. */
function mergeProgressMonotonic(
  prev: WorkerOnboardingProgressPayload,
  incoming: WorkerOnboardingProgressPayload
): WorkerOnboardingProgressPayload {
  const byStepId = new Map(incoming.steps.map((row) => [row.onboarding_step_id, row]));
  for (const row of prev.steps) {
    const next = byStepId.get(row.onboarding_step_id);
    const prevRank = PROGRESS_STATUS_RANK[row.status as OnboardingStepStatus] ?? 0;
    const nextRank = next
      ? PROGRESS_STATUS_RANK[next.status as OnboardingStepStatus] ?? 0
      : -1;
    if (prevRank > nextRank) {
      byStepId.set(row.onboarding_step_id, row);
    }
  }
  return { ...incoming, steps: Array.from(byStepId.values()) };
}

type ConfigPayload = {
  config?: TenantOnboardingConfig;
  allWorkflowSteps?: TenantOnboardingStep[];
  error?: string;
  detail?: string;
  code?: string;
  source?: string;
  jobToken?: string | null;
  workflowPhase?: ApplicantLifecyclePhase;
  applicationId?: string | null;
  postHireActivatedAt?: string | null;
};

export default function OnboardingConfigProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantFromUrl = searchParams.get("tenant");
  const jobTokenFromUrl = normalizeJobToken(searchParams.get("job_token"));
  const applicationIdFromUrl = searchParams.get("applicationId")?.trim() || "";
  /** Direct Start Application lands on add-resume without job_token — ignore stale localStorage. */
  const isDirectOnboardingEntry =
    !jobTokenFromUrl && Boolean(pathname?.includes("/application/add-resume"));
  const isDraftPreview =
    searchParams.get("preview") === "draft" ||
    searchParams.get("mode")?.trim().toLowerCase() === "test";
  const [recoveredJobToken, setRecoveredJobToken] = useState<string | null>(null);
  /** Test workflow / draft preview is never a live job application. */
  const resolvedJobToken =
    isDraftPreview || isDirectOnboardingEntry
      ? null
      : jobTokenFromUrl || currentApplicationJobToken() || recoveredJobToken;

  useEffect(() => {
    if (!isDraftPreview && jobTokenFromUrl) rememberApplicationJobToken(jobTokenFromUrl);
  }, [isDraftPreview, jobTokenFromUrl]);
  const { sessionReady, sessionLoading } = useApplicantSession();

  const [config, setConfig] = useState<TenantOnboardingConfig | null>(null);
  const [allWorkflowSteps, setAllWorkflowSteps] = useState<TenantOnboardingStep[]>([]);
  const [progress, setProgress] = useState<WorkerOnboardingProgressPayload | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [progressHydrated, setProgressHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<OnboardingConfigSource>(null);
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [workflowPhase, setWorkflowPhase] = useState<ApplicantLifecyclePhase>("pre_hire");

  const progressFetchSeq = useRef(0);
  const configFetchSeq = useRef(0);

  const fetchProgress = useCallback(async (aid: string, slug: string) => {
    const requestId = ++progressFetchSeq.current;
    setLoadingProgress(true);
    try {
      const params = new URLSearchParams({ applicantId: aid, tenant: slug });
      if (resolvedJobToken) params.set("job_token", resolvedJobToken);
      const scopedApplicationId = applicationIdFromUrl || applicationId;
      if (scopedApplicationId) params.set("applicationId", scopedApplicationId);
      const progRes = await safeFetchJson<{ progress?: WorkerOnboardingProgressPayload | null }>(
        `/api/onboarding/progress?${params}`,
        { cache: "no-store" }
      );
      if (requestId !== progressFetchSeq.current) return;
      if (progRes.ok) {
        const incoming = progRes.data.progress ?? null;
        setProgress((prev) => {
          if (!incoming) return null;
          if (!prev) return incoming;
          return mergeProgressMonotonic(prev, incoming);
        });
        setProgressHydrated(true);
      }
    } finally {
      if (requestId === progressFetchSeq.current) {
        setLoadingProgress(false);
      }
    }
  }, [resolvedJobToken, applicationIdFromUrl, applicationId]);

  const refreshConfig = useCallback(async () => {
    const requestId = ++configFetchSeq.current;
    setLoadingConfig(true);
    setError(null);

    const search = typeof window !== "undefined" ? window.location.search : "";
    const slug = resolveClientOnboardingTenantSlug(search);

    try {
      if (!slug) {
        if (requestId !== configFetchSeq.current) return;
        setConfig(null);
        setSource(null);
        setError("Select a tenant to load onboarding.");
        return;
      }

      if (isDraftPreview) {
        const preview = readOnboardingPreview(slug);
        if (preview?.config) {
          if (requestId !== configFetchSeq.current) return;
          setConfig(applyApplicantConfigFilters(preview.config));
          setSource("draft-preview");
          return;
        }

        const draftRes = await safeFetchJson<ConfigPayload>(
          `/api/onboarding/preview-config?slug=${encodeURIComponent(slug)}`,
          { cache: "no-store" }
        );

        if (requestId !== configFetchSeq.current) return;

        if (draftRes.ok && draftRes.data.config) {
          setConfig(applyApplicantConfigFilters(draftRes.data.config));
          setSource("draft-api");
          return;
        }

        setConfig(null);
        setSource(null);
        const draftMessage = !draftRes.ok
          ? draftRes.data?.error ?? draftRes.error
          : "Draft preview is unavailable.";
        setError(
          draftMessage ||
            "Open preview from the Onboarding Builder so the draft workflow can be loaded."
        );
        return;
      }

      const jobToken = resolvedJobToken;
      const aid = readApplicantId();
      const configQuery = new URLSearchParams({ slug });
      if (jobToken) configQuery.set("job_token", jobToken);
      if (aid) configQuery.set("applicantId", aid);
      if (applicationIdFromUrl) configQuery.set("applicationId", applicationIdFromUrl);
      if (!jobToken && aid && !isDirectOnboardingEntry) configQuery.set("infer_application", "1");

      const configRes = await safeFetchJson<ConfigPayload>(
        `/api/onboarding/config?${configQuery}`,
        { cache: "no-store" }
      );

      if (requestId !== configFetchSeq.current) return;

      if (!configRes.ok) {
        setConfig(null);
        setSource(null);
        setError(
          configRes.data?.detail ??
            configRes.data?.error ??
            configRes.error ??
            "Could not load onboarding configuration."
        );
        return;
      }

      if (configRes.data.config) {
        const recovered = normalizeJobToken(configRes.data.jobToken ?? null);
        if (!jobToken && recovered && configRes.data.source === "job-workflow") {
          rememberApplicationJobToken(recovered);
          setRecoveredJobToken(recovered);
        }
        setConfig(applyApplicantConfigFilters(configRes.data.config));
        setAllWorkflowSteps(
          configRes.data.allWorkflowSteps ??
            configRes.data.config.steps.filter((s) => s.is_enabled)
        );
        setWorkflowPhase(configRes.data.workflowPhase ?? "pre_hire");
        setApplicationId(configRes.data.applicationId ?? (applicationIdFromUrl || null));
        setSource(
          configRes.data.source === "job-workflow"
            ? "job-workflow"
            : configRes.data.source === "worker-onboarding"
              ? "worker-onboarding"
              : "published"
        );
      } else {
        setConfig(null);
        setSource(null);
        setError("Onboarding configuration is missing for this tenant.");
      }
    } finally {
      if (requestId === configFetchSeq.current) {
        setLoadingConfig(false);
      }
    }
  }, [isDraftPreview, isDirectOnboardingEntry, resolvedJobToken, applicationIdFromUrl]);

  const refreshProgressOnly = useCallback(async () => {
    const aid = readApplicantId();
    setApplicantId(aid);
    const search = typeof window !== "undefined" ? window.location.search : "";
    const slug = resolveClientOnboardingTenantSlug(search);

    if (isDraftPreview) {
      setProgress(null);
      setProgressHydrated(true);
      setLoadingProgress(false);
      return;
    }

    if (!sessionReady || sessionLoading) {
      setLoadingProgress(true);
      return;
    }

    if (aid && slug) {
      await fetchProgress(aid, slug);
    } else {
      setProgress(null);
      setProgressHydrated(true);
      setLoadingProgress(false);
    }
  }, [fetchProgress, isDraftPreview, sessionReady, sessionLoading]);

  const refresh = useCallback(async () => {
    await refreshConfig();
    await refreshProgressOnly();
  }, [refreshConfig, refreshProgressOnly]);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig, tenantFromUrl, resolvedJobToken]);

  useEffect(() => {
    void refreshProgressOnly();
  }, [refreshProgressOnly, tenantFromUrl, resolvedJobToken, sessionReady, sessionLoading]);

  const updateStepStatus = useCallback(
    async (
      stepKey: string,
      status: OnboardingStepStatus,
      data?: Record<string, unknown>,
      stepId?: string
    ) => {
      if (isDraftPreview) return;
      const aid = readApplicantId();
      if (!aid) return;
      const search = typeof window !== "undefined" ? window.location.search : "";
      const slug = resolveClientOnboardingTenantSlug(search);
      const preferredId = typeof stepId === "string" ? stepId.trim() : "";
      const matchedStep =
        (preferredId
          ? config?.steps.find((s) => s.id === preferredId) ??
            allWorkflowSteps.find((s) => s.id === preferredId)
          : null) ??
        config?.steps.find((s) => s.step_key === stepKey) ??
        allWorkflowSteps.find((s) => s.step_key === stepKey);
      const jobToken = resolvedJobToken;
      const res = await fetch("/api/onboarding/progress/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantId: aid,
          tenantSlug: slug,
          jobToken: jobToken || undefined,
          applicationId: applicationIdFromUrl || applicationId || undefined,
          stepKey,
          stepId: matchedStep?.id || preferredId || undefined,
          status,
          data,
        }),
      });
      const responsePayload = (await res.json().catch(() => ({}))) as {
        error?: string;
        progress?: WorkerOnboardingProgressPayload;
      };
      if (!res.ok) {
        throw new Error(responsePayload.error || "Could not update onboarding progress.");
      }

      if (responsePayload.progress) {
        setProgress((prev) => ({
          ...responsePayload.progress!,
          workflowPhase: responsePayload.progress?.workflowPhase ?? prev?.workflowPhase,
          applicationId: responsePayload.progress?.applicationId ?? prev?.applicationId,
          applicationStatus: responsePayload.progress?.applicationStatus ?? prev?.applicationStatus,
          submittedAt: responsePayload.progress?.submittedAt ?? prev?.submittedAt,
        }));
        setProgressHydrated(true);
        return;
      }

      const step = matchedStep;
      if (step) {
        setProgress((prev) => {
          if (!prev) return prev;
          const rows = prev.steps.slice();
          const idx = rows.findIndex((row) => row.onboarding_step_id === step.id);
          const nextRow = {
            onboarding_step_id: step.id,
            step_key: step.step_key,
            status,
            completed_at: status === "completed" ? new Date().toISOString() : null,
            data: data ?? rows[idx]?.data ?? {},
          };
          if (idx >= 0) rows[idx] = nextRow;
          else rows.push(nextRow);
          return { ...prev, steps: rows };
        });
        setProgressHydrated(true);
      }
    },
    [isDraftPreview, config?.steps, allWorkflowSteps, resolvedJobToken, applicationIdFromUrl, applicationId]
  );

  const maxAllowedStepIndex = useMemo(
    () => computeMaxAllowedStepIndex(config, progress, pathname),
    [config, progress, pathname]
  );

  const waitingOnInternal = useMemo(() => {
    if (!config) return false;
    // Unscoped progress on a job link belongs to an earlier application, not this one.
    if (resolvedJobToken && !progress?.applicationId) return false;
    const candidateSteps = getEnabledTenantSteps(config);
    return computeCandidateOnboardingFrontier({
      engineOrder: config.candidateEngineOrder,
      candidateSteps,
      progress,
    }).waitingOnInternal;
  }, [config, progress, resolvedJobToken]);

  const loading = loadingConfig || loadingProgress || sessionLoading || !sessionReady;

  const value = useMemo(
    () => ({
      config,
      progress,
      loading,
      loadingConfig,
      loadingProgress,
      progressHydrated,
      error,
      source,
      isDraftPreview,
      applicantId,
      applicationId,
      workflowPhase,
      allWorkflowSteps,
      refresh,
      updateStepStatus,
      maxAllowedStepIndex,
      waitingOnInternal,
    }),
    [
      config,
      progress,
      loading,
      loadingConfig,
      loadingProgress,
      progressHydrated,
      error,
      source,
      isDraftPreview,
      applicantId,
      applicationId,
      workflowPhase,
      allWorkflowSteps,
      refresh,
      updateStepStatus,
      maxAllowedStepIndex,
      waitingOnInternal,
    ]
  );

  return (
    <OnboardingConfigContext.Provider value={value}>{children}</OnboardingConfigContext.Provider>
  );
}
