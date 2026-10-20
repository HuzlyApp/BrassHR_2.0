"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import type { JobRequisitionInput, PlacementType, SourceType } from "@/lib/jobs/types";
import type { JobScreeningQuestionInput } from "@/lib/jobs/screening-questions";
import { isLiveJobRequisitionStatus } from "@/lib/jobs/job-status";
import { isRemoteJobLocationType } from "@/lib/service-area/location-type";
import {
  jobRequiresWorkflow,
  placementTypeFromApiRow,
  resolvePlacementTypeForSource,
} from "@/lib/jobs/placement";
import { JobPostPreviewModal } from "./JobPostPreviewModal";
import { JobReviewEditModal, type ReviewEditFieldId } from "./JobReviewEditModal";
import { jobDescriptionPlainText } from "./JobDescriptionEditor";
import { readServiceAreaApiMessage, SERVICE_AREA_COPY } from "@/lib/service-area/copy";
import { invalidateJobsListCache } from "@/lib/lists/staff-list-session-cache";
import { showsRemoteAllowedStatesField } from "./RemoteAllowedStatesField";
import {
  JobFormFooter,
  JobFormStepCompensation,
  JobFormStepDescription,
  JobFormStepMspDetails,
  JobFormStepRequisition,
  JobFormStepReview,
  JobFormWorkflowBanner,
} from "./JobFormSteps";
import { JobFormStepSetup } from "./JobFormStepSetup";
import type { ExistingJobPickerOption } from "./ExistingJobPickerPanel";
import {
  applyUiToJob,
  defaultJobFormUiState,
  JOB_FORM_CENTER_COLUMN_CLASS,
  JOB_FORM_OUTLINE_BUTTON_CLASS,
  JOB_FORM_PAGE_CARD_CLASS,
  JOB_FORM_PRIMARY_BUTTON_CLASS,
  jobFormUiFromJob,
  jobRequisitionInputForNewFromReference,
  jobRequisitionInputFromApiRow,
  primaryButtonStyle,
  type JobFormOptionsPayload,
  type JobFormStep,
  type JobFormUiState,
} from "./job-form-shared";
import {
  JOB_POSTING_HELPER_CLASS,
  JOB_POSTING_PAGE_TITLE_CLASS,
} from "./job-posting-typography";
import { ArrowRight } from "lucide-react";
import { LEGAL_ROUTES } from "@/lib/legal/routes";
import {
  clearJobRequisitionFormDraft,
  readJobRequisitionFormDraft,
  writeJobRequisitionFormDraft,
} from "@/lib/jobs/job-requisition-form-draft";
import { legalReturnHref } from "@/lib/signup/tenant-signup-draft";
import { matchProfessionIdByName } from "@/lib/jobs/profession-text";

const initialJob: JobRequisitionInput = {
  sourceType: "" as SourceType,
  placementType: null,
  professionId: "",
  profession: "",
  specialtyId: null,
  employmentType: "" as JobRequisitionInput["employmentType"],
  internalRequisitionNumber: "",
  publicTitle: "",
  publicDescription: "",
  location: "",
  postalCode: null,
  employerOfRecord: null,
};

export default function JobRequisitionForm({ jobId }: { jobId?: string }) {
  const router = useRouter();
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const brandStyle = primaryButtonStyle(brandVars);

  const [persistedJobId, setPersistedJobId] = useState(jobId);
  const [step, setStep] = useState<JobFormStep>(jobId ? "requisition" : "setup");
  const [job, setJob] = useState<JobRequisitionInput>(initialJob);
  const [ui, setUi] = useState<JobFormUiState>(defaultJobFormUiState);
  const [options, setOptions] = useState<JobFormOptionsPayload | null>(null);
  const [mspSourcedByClient, setMspSourcedByClient] = useState<boolean | null>(null);
  const [mspPlacementType, setMspPlacementType] = useState<PlacementType | null>(null);
  const [referenceJobId, setReferenceJobId] = useState<string | null>(null);
  const [referenceJobOptions, setReferenceJobOptions] = useState<ExistingJobPickerOption[]>([]);
  const [referenceJobsLoading, setReferenceJobsLoading] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [workflow, setWorkflow] = useState<{
    workflowId?: string;
    workflowName: string;
    mappingCriteria?: string;
    source?: string;
  } | null>(null);
  const [workflowWarning, setWorkflowWarning] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<"automatic" | "manual">("automatic");
  const [overrideWorkflowId, setOverrideWorkflowId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reviewEditField, setReviewEditField] = useState<ReviewEditFieldId | null>(null);
  const [originalStatus, setOriginalStatus] = useState<"draft" | "published">("draft");
  const [confirmRoutingChange, setConfirmRoutingChange] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [screeningQuestions, setScreeningQuestions] = useState<JobScreeningQuestionInput[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [serviceAreaBlocked, setServiceAreaBlocked] = useState(false);
  const [serviceAreaBlockMessage, setServiceAreaBlockMessage] = useState<string | null>(null);
  const skipJobLoadRef = useRef(false);

  const onServiceAreaBlockedChange = useCallback((blocked: boolean, message: string | null) => {
    setServiceAreaBlocked(blocked);
    setServiceAreaBlockMessage(message);
  }, []);

  const returnTo = jobId
    ? `/admin_recruiter/jobs/${encodeURIComponent(jobId)}/edit`
    : "/admin_recruiter/jobs/new";
  const tenantTermsHref = legalReturnHref(LEGAL_ROUTES.tenantTerms, returnTo);
  const privacyPolicyHref = legalReturnHref(LEGAL_ROUTES.privacyPolicy, returnTo);

  useLayoutEffect(() => {
    const draft = readJobRequisitionFormDraft(jobId ?? null);
    if (draft) {
      skipJobLoadRef.current = Boolean(jobId);
      setStep(draft.step);
      setJob(draft.job);
      setUi(draft.ui);
      setMspSourcedByClient(draft.mspSourcedByClient);
      setMspPlacementType(draft.mspPlacementType);
      setReferenceJobId(draft.referenceJobId);
      setAssignmentMode(draft.assignmentMode);
      setOverrideWorkflowId(draft.overrideWorkflowId);
      setTermsAccepted(draft.termsAccepted);
      setScreeningQuestions(draft.screeningQuestions);
      setConfirmRoutingChange(draft.confirmRoutingChange);
    }
    setDraftHydrated(true);
  }, [jobId]);

  useLayoutEffect(() => {
    if (!draftHydrated || saving) return;
    writeJobRequisitionFormDraft({
      jobId: jobId ?? null,
      step,
      job,
      ui,
      mspSourcedByClient,
      mspPlacementType,
      referenceJobId,
      assignmentMode,
      overrideWorkflowId,
      termsAccepted,
      screeningQuestions,
      confirmRoutingChange,
    });
  }, [
    draftHydrated,
    saving,
    jobId,
    step,
    job,
    ui,
    mspSourcedByClient,
    mspPlacementType,
    referenceJobId,
    assignmentMode,
    overrideWorkflowId,
    termsAccepted,
    screeningQuestions,
    confirmRoutingChange,
  ]);

  useEffect(() => {
    void fetch("/api/admin/job-options", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load options");
        setOptions(payload);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load options"));
  }, []);

  useEffect(() => {
    if (jobId) return;
    const primary = options?.primaryIndustryKey;
    if (!primary) return;
    setJob((current) => (current.industryKey ? current : { ...current, industryKey: primary }));
  }, [jobId, options?.primaryIndustryKey]);

  useEffect(() => {
    if (jobId) return;
    setReferenceJobsLoading(true);
    void fetch("/api/admin/jobs", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load jobs");
        setReferenceJobOptions((payload.jobs ?? []) as ExistingJobPickerOption[]);
      })
      .catch(() => setReferenceJobOptions([]))
      .finally(() => setReferenceJobsLoading(false));
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    if (skipJobLoadRef.current) {
      skipJobLoadRef.current = false;
      return;
    }
    void fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load job");
        const row = payload.job as Record<string, unknown>;
        setOriginalStatus(
          isLiveJobRequisitionStatus(String(row.status ?? "")) ? "published" : "draft"
        );
        const loadedJob = jobRequisitionInputFromApiRow(row);
        setJob(loadedJob);
        setUi(jobFormUiFromJob(loadedJob));
        const sourceRaw = String(row.source_type ?? "").trim().toLowerCase();
        setMspSourcedByClient(sourceRaw === "msp");
        if (sourceRaw === "msp") {
          setMspPlacementType(
            loadedJob.placementType === "Recruit_and_EOR"
              ? "Recruit_and_EOR"
              : "Recruit_and_Release"
          );
        }
        const mode = row.workflow_assignment_mode === "manual" ? "manual" : "automatic";
        setAssignmentMode(mode);
        if (mode === "manual" && row.workflow_id) {
          setOverrideWorkflowId(String(row.workflow_id));
          const flow = row.onboarding_flows as { name?: string } | { name?: string }[] | null;
          const flowName = Array.isArray(flow) ? flow[0]?.name : flow?.name;
          setWorkflow({
            workflowId: String(row.workflow_id),
            workflowName: flowName ? String(flowName) : "Manually assigned workflow",
            mappingCriteria: "Manual override",
            source: "manual",
          });
        }
        setStep(loadedJob.sourceType === "MSP" ? "msp-details" : "requisition");
        setScreeningQuestions(
          Array.isArray(payload.screeningQuestions)
            ? (payload.screeningQuestions as JobScreeningQuestionInput[])
            : []
        );
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load job"));
  }, [jobId]);

  /** MSP R&R locks employment type to Contract; EOR W2/1099 must be chosen by the user. */
  useEffect(() => {
    if (job.sourceType !== "MSP") return;
    if (job.placementType === "Recruit_and_Release" && job.employmentType !== "Contract") {
      setJob((current) =>
        current.sourceType === "MSP" && current.placementType === "Recruit_and_Release"
          ? { ...current, employmentType: "Contract" }
          : current
      );
    }
  }, [job.sourceType, job.placementType, job.employmentType]);

  /** Keep create-job steps starting at the top after Next/Back. */
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const wrap = document.querySelector(".admin-recruiter-main-wrap");
      if (wrap instanceof HTMLElement) wrap.scrollTop = 0;
    };
    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  const professionLabel = useMemo(
    () =>
      job.profession?.trim() ||
      options?.professions.find((item) => item.id === job.professionId)?.name ||
      "",
    [job.profession, job.professionId, options?.professions]
  );

  const specialtyLabel = useMemo(
    () => options?.specialties.find((item) => item.id === job.specialtyId)?.name ?? "",
    [job.specialtyId, options?.specialties]
  );

  const mappingLink = useMemo(() => {
    const params = new URLSearchParams();
    if (job.professionId) params.set("professionId", job.professionId);
    if (job.employmentType) params.set("employmentType", job.employmentType);
    return `/admin_recruiter/dashboard/workflow-mappings?${params}`;
  }, [job.employmentType, job.professionId]);

  useEffect(() => {
    if (assignmentMode === "manual" && overrideWorkflowId) {
      const selected = options?.workflows?.find((item) => item.id === overrideWorkflowId);
      setWorkflow({
        workflowId: overrideWorkflowId,
        workflowName: selected?.name ?? "Manually assigned workflow",
        mappingCriteria: "Manual override",
        source: "manual",
      });
      setWorkflowWarning("");
      setFieldErrors((current) => {
        if (!current.workflowId) return current;
        const next = { ...current };
        delete next.workflowId;
        return next;
      });
      return;
    }

    if (!job.employmentType) {
      setWorkflow(null);
      setWorkflowWarning("");
      return;
    }
    const params = new URLSearchParams({
      employmentType: job.employmentType,
    });
    if (job.professionId) params.set("professionId", job.professionId);
    if (job.specialtyId) params.set("specialtyId", job.specialtyId);
    if (job.location) params.set("location", job.location);
    if (job.jobLocationType) params.set("locationType", job.jobLocationType);
    if (job.yearsOfExperience) params.set("yearsOfExperience", job.yearsOfExperience);

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/admin/jobs/workflow-preview?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json();
          if (response.ok && payload.match) {
            setWorkflow({
              workflowId: payload.match.workflowId,
              workflowName: payload.match.workflowName,
              mappingCriteria: payload.match.mappingCriteria,
              source: payload.match.source,
            });
            setWorkflowWarning("");
            setFieldErrors((current) => {
              if (!current.workflowId) return current;
              const next = { ...current };
              delete next.workflowId;
              return next;
            });
          } else {
            setWorkflow(null);
            setWorkflowWarning(payload.warning || payload.error || "No workflow is configured.");
          }
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setWorkflow(null);
          setWorkflowWarning("Workflow assignment could not be checked.");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    assignmentMode,
    overrideWorkflowId,
    job.sourceType,
    job.placementType,
    job.profession,
    job.professionId,
    job.specialtyId,
    job.employmentType,
    job.location,
    job.jobLocationType,
    job.yearsOfExperience,
    options?.workflows,
    options?.professions,
  ]);

  useEffect(() => {
    const name = job.profession?.trim();
    if (!name || !options?.professions?.length) return;
    const nextId = matchProfessionIdByName(options.professions, name);
    if ((job.professionId || null) === (nextId || null)) return;
    setJob((current) => ({
      ...current,
      professionId: nextId ?? "",
      specialtyId: (current.professionId || null) === (nextId || null) ? current.specialtyId : null,
    }));
  }, [job.profession, job.professionId, options?.professions]);

  function updateJob<K extends keyof JobRequisitionInput>(key: K, value: JobRequisitionInput[K]) {
    if (
      originalStatus === "published" &&
      (key === "professionId" || key === "employmentType")
    ) {
      setConfirmRoutingChange(false);
    }
    setJob((current) => {
      const next = { ...current, [key]: value };
      if (key === "location" || key === "postalCode") {
        next.worksiteCity = null;
        next.worksiteState = null;
        next.worksitePostalCode = null;
      }
      return next;
    });
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateUi(patch: Partial<JobFormUiState>) {
    const clearsRemote =
      "jobLocationType" in patch &&
      patch.jobLocationType != null &&
      !showsRemoteAllowedStatesField(patch.jobLocationType);

    setUi((current) => ({
      ...current,
      ...patch,
      ...(clearsRemote ? { remoteStatesScope: "all" as const } : {}),
    }));
    if (clearsRemote) {
      setJob((current) => ({ ...current, remoteAllowedStates: [] }));
    }
    if ("jobLocationType" in patch) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.remoteAllowedStates;
        return next;
      });
    }
  }

  function buildPayloadJob(): JobRequisitionInput {
    return applyUiToJob(job, ui);
  }

  function validateRequisitionStep(current: JobRequisitionInput): Record<string, string> {
    const errors: Record<string, string> = {};
    const isMsp = current.sourceType === "MSP";
    const isMspEor = isMsp && current.placementType === "Recruit_and_EOR";
    const isRemote = isRemoteJobLocationType(current.jobLocationType ?? current.schedule);

    const location = current.location?.trim() || current.facility?.trim() || "";
    if (isRemote) {
      if (ui.remoteStatesScope === "restrict" && !current.remoteAllowedStates?.length) {
        errors.remoteAllowedStates =
          "Select at least one state, or switch back to All States.";
      }
    } else if (!location) {
      errors.location = "Location is required.";
    }

    if (!current.shiftType?.trim()) {
      errors.shiftType = "Employment Type is required.";
    }

    if (isMsp) {
      if (!current.sourceJobTitle?.trim()) {
        errors.sourceJobTitle = "Source Job Title is required.";
      }
      if (!current.professionId?.trim()) {
        errors.professionId = "Profession is required.";
      }
      if (isMspEor) {
        if (current.employmentType !== "W2" && current.employmentType !== "1099") {
          errors.employmentType = "Select W2 or 1099 for EOR placements.";
        }
      }
    } else {
      if (!current.publicTitle?.trim()) {
        errors.publicTitle = "Job Title is required.";
      }
      if (!current.professionId?.trim()) {
        errors.professionId = "Profession is required.";
      }
      if (!current.employmentType) {
        errors.employmentType = "Employment Type is required.";
      }
    }

    return errors;
  }

  function assignedWorkflowId(): string | null {
    if (assignmentMode === "manual" && overrideWorkflowId?.trim()) {
      return overrideWorkflowId.trim();
    }
    return workflow?.workflowId?.trim() || null;
  }

  function validateWorkflowAssignment(): Record<string, string> {
    if (!jobRequiresWorkflow(buildPayloadJob())) return {};
    if (assignedWorkflowId()) return {};
    return {
      workflowId:
        (options?.workflows?.length ?? 0) === 0
          ? "Create and publish a workflow, then assign it to this job."
          : "Assign a published workflow before continuing.",
    };
  }
  function validateDescriptionStep(current: JobRequisitionInput): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!jobDescriptionPlainText(current.publicDescription ?? "").trim()) {
      errors.publicDescription = "Job description is required.";
    }
    return errors;
  }

  async function save(action: "save_draft" | "publish", forceRoutingChange = false) {
    setSaving(true);
    setMessage("");
    setFieldErrors({});
    const payloadJob = buildPayloadJob();

    if (action === "publish" && serviceAreaBlocked) {
      const blockedMessage = serviceAreaBlockMessage || SERVICE_AREA_COPY.location_not_enabled;
      setFieldErrors({ location: blockedMessage });
      setMessage(blockedMessage);
      setSaving(false);
      // Stay on review when already reviewing — show the error there instead of jumping back.
      if (step !== "review") {
        if (payloadJob.sourceType === "MSP") setStep("msp-details");
        else setStep("requisition");
      }
      return;
    }
    if (action === "save_draft" && serviceAreaBlocked) {
      setMessage(
        serviceAreaBlockMessage ||
          `${SERVICE_AREA_COPY.location_not_enabled} You can save this draft, but it cannot be published yet.`
      );
    }

    if (action === "publish") {
      const stepErrors = {
        ...validateRequisitionStep(payloadJob),
        ...validateDescriptionStep(payloadJob),
        ...validateWorkflowAssignment(),
      };
      if (Object.keys(stepErrors).length > 0) {
        setFieldErrors(stepErrors);
        setSaving(false);
        if (stepErrors.publicDescription) {
          setStep("description");
        } else if (
          !(step === "review" && (stepErrors.remoteAllowedStates || stepErrors.location)) &&
          (stepErrors.location ||
            stepErrors.remoteAllowedStates ||
            stepErrors.shiftType ||
            stepErrors.sourceJobTitle ||
            stepErrors.publicTitle ||
            stepErrors.professionId ||
            stepErrors.employmentType ||
            stepErrors.workflowId)
        ) {
          setStep(payloadJob.sourceType === "MSP" ? "msp-details" : "requisition");
        }
        setMessage("Please complete the required fields before publishing.");
        return;
      }
    }

    try {
      const response = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          job: payloadJob,
          jobId: persistedJobId,
          screeningQuestions,
          confirmRoutingChange: forceRoutingChange || confirmRoutingChange,
          resetToAutomatic: assignmentMode === "automatic",
          overrideWorkflowId: assignmentMode === "manual" ? overrideWorkflowId : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === "ROUTING_CHANGE_CONFIRMATION_REQUIRED") {
          const confirmed = window.confirm(
            `${payload.error}\n\nExisting applicants will keep their current workflow. Continue?`
          );
          if (confirmed) {
            setConfirmRoutingChange(true);
            await save(action, true);
            return;
          }
        }
        setFieldErrors(payload.fieldErrors ?? {});
        const apiFieldErrors = (payload.fieldErrors ?? {}) as Record<string, string>;
        if (
          !(
            step === "review" &&
            (apiFieldErrors.remoteAllowedStates || apiFieldErrors.location)
          ) &&
          (apiFieldErrors.remoteAllowedStates ||
            apiFieldErrors.location ||
            apiFieldErrors.shiftType ||
            apiFieldErrors.sourceJobTitle ||
            apiFieldErrors.publicTitle ||
            apiFieldErrors.professionId ||
            apiFieldErrors.employmentType)
        ) {
          setStep(payloadJob.sourceType === "MSP" ? "msp-details" : "requisition");
        }
        throw new Error(readServiceAreaApiMessage(payload, "Failed to save job"));
      }
      if (payload.job?.id) {
        setPersistedJobId(String(payload.job.id));
      }
      if (payload.serviceAreaWarning) {
        // Draft was saved with a hold warning — treat as successful save and leave the form.
        setOriginalStatus("draft");
      }
      clearJobRequisitionFormDraft();
      invalidateJobsListCache();
      const reanalysisCount = Number(payload.matchReanalysisScheduled ?? 0);
      if (Number.isFinite(reanalysisCount) && reanalysisCount > 0) {
        toast.success(
          reanalysisCount === 1
            ? "Job updated. Re-analyzing 1 candidate against the new description."
            : `Job updated. Re-analyzing ${reanalysisCount} candidates against the new description.`
        );
      }
      router.push("/admin_recruiter/jobs");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save job");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (step === "setup") {
      router.push("/admin_recruiter/jobs");
      return;
    }
    if (step === "msp-details") {
      setStep(jobId ? "requisition" : "setup");
      return;
    }
    if (step === "requisition") {
      if (!jobId) {
        setStep("setup");
        return;
      }
      router.push("/admin_recruiter/jobs");
      return;
    }
    if (step === "compensation") {
      setStep(job.sourceType === "MSP" ? "msp-details" : "requisition");
      return;
    }
    if (step === "description") {
      setStep("compensation");
      return;
    }
    if (step === "review") {
      setStep("description");
      return;
    }
    router.push("/admin_recruiter/jobs");
  }

  async function handleSetupContinue() {
    if (mspSourcedByClient == null) {
      setFieldErrors({ mspSourcedByClient: "Please select Yes or No." });
      return;
    }
    if (mspSourcedByClient && !mspPlacementType) {
      setFieldErrors({ mspPlacementType: "Select Recruit & Release or Recruit & EOR." });
      return;
    }
    setFieldErrors({});
    setSetupBusy(true);
    setMessage("");

    const nextSourceType: SourceType = mspSourcedByClient ? "MSP" : "Internal";
    const nextPlacementType = resolvePlacementTypeForSource(
      nextSourceType,
      mspPlacementType
    );

    try {
      if (referenceJobId) {
        const response = await fetch(`/api/admin/jobs/${encodeURIComponent(referenceJobId)}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load reference job");
        const loaded = jobRequisitionInputFromApiRow(payload.job as Record<string, unknown>);
        const nextJob = jobRequisitionInputForNewFromReference(
          loaded,
          nextSourceType,
          mspPlacementType
        );
        setJob(nextJob);
        setUi(jobFormUiFromJob(nextJob));
      } else {
        setJob((current) => ({
          ...initialJob,
          sourceType: nextSourceType,
          placementType: nextPlacementType,
          publicTitle: current.publicTitle,
          employmentType: mspSourcedByClient
            ? nextPlacementType === "Recruit_and_EOR"
              ? ("" as JobRequisitionInput["employmentType"])
              : ("Contract" as JobRequisitionInput["employmentType"])
            : ("" as JobRequisitionInput["employmentType"]),
        }));
        setUi(
          nextPlacementType === "Recruit_and_Release"
            ? {
                ...defaultJobFormUiState(),
                showPayBy: "Range",
                payRatePeriod: "Hourly",
                hoursShowBy: "Fixed Hours",
              }
            : defaultJobFormUiState()
        );
      }

      setStep(mspSourcedByClient ? "msp-details" : "requisition");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load reference job");
    } finally {
      setSetupBusy(false);
    }
  }

  function handleNext() {
    if (step === "requisition" || step === "msp-details") {
      const errors = {
        ...validateRequisitionStep(buildPayloadJob()),
        ...validateWorkflowAssignment(),
      };
      if (Object.keys(errors).length > 0) {
        setFieldErrors((current) => ({ ...current, ...errors }));
        return;
      }
      // Restricted locations can continue as draft; publish stays blocked on review.
      setStep(
        step === "requisition" && job.sourceType === "MSP" ? "msp-details" : "compensation"
      );
      return;
    }
    if (step === "compensation") {
      setStep("description");
      return;
    }
    if (step === "description") {
      const errors = validateDescriptionStep(job);
      if (Object.keys(errors).length > 0) {
        setFieldErrors((current) => ({ ...current, ...errors }));
        return;
      }
      setStep("review");
    }
  }

  const pageTitle =
    step === "setup"
      ? "Create Job Requisition"
      : step === "review"
        ? "Review"
        : step === "description"
          ? "Describe the job"
          : step === "compensation"
            ? job.sourceType === "MSP"
              ? "Rates & Contract"
              : "Compensation"
            : jobId
              ? "Edit job post"
              : "Create a job post";
  const pageSubtitle =
    step === "setup"
      ? ""
      : step === "review"
        ? ""
        : step === "description"
          ? "Add job description"
          : step === "compensation"
            ? "Review the pay we estimated for your job and adjust as needed. Check your local minimum wage."
            : step === "msp-details"
              ? "Job Source Details"
              : "Job Requisition";
  const showPublishActions = step === "review";
  const requiresWorkflow = jobRequiresWorkflow(buildPayloadJob());

  return (
    <main className="w-full min-w-0 overflow-x-hidden px-2 py-3 min-[700px]:px-4 min-[700px]:py-4 lg:px-5">
      <div className={JOB_FORM_PAGE_CARD_CLASS} style={brandVars}>
        <div className={JOB_FORM_CENTER_COLUMN_CLASS}>
          <div className="mb-5 flex flex-col gap-2 min-[700px]:mb-6 min-[700px]:gap-1">
            <div className="flex items-start justify-between gap-3 min-[700px]:gap-4">
              <h1 className={`min-w-0 flex-1 ${JOB_POSTING_PAGE_TITLE_CLASS}`}>
                {pageTitle}
              </h1>
              <Link
                href="/admin_recruiter/jobs"
                className={`mt-1 inline-flex shrink-0 items-center gap-1 self-start whitespace-nowrap text-sm font-medium no-underline transition hover:opacity-80 min-[700px]:mt-0 ${
                  step === "setup" ? "hidden" : ""
                }`}
                style={{ color: branding.secondaryHex || "#012352" }}
              >
                <BrandedSvgIcon
                  src="/eva_arrow-back-fill.svg"
                  className="h-[14px] w-[14px]"
                  color={branding.secondaryHex || "#012352"}
                />
                Back to jobs
              </Link>
            </div>
            {pageSubtitle ? (
              <p
                className={`w-full max-w-none ${JOB_POSTING_HELPER_CLASS}`}
              >
                {pageSubtitle}
              </p>
            ) : null}
          </div>

          {message ? (
            <div className="mb-5 whitespace-pre-line rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {message}
            </div>
          ) : null}

          <div
            className={
              step === "requisition" || step === "setup"
                ? "flex min-h-0 flex-1 flex-col gap-5"
                : "flex-1 space-y-5"
            }
          >
            {step === "setup" ? (
              <JobFormStepSetup
                mspSourcedByClient={mspSourcedByClient}
                onMspSourcedByClientChange={(value) => {
                  setMspSourcedByClient(value);
                  if (!value) setMspPlacementType(null);
                  setFieldErrors((current) => {
                    const next = { ...current };
                    delete next.mspSourcedByClient;
                    delete next.mspPlacementType;
                    return next;
                  });
                  setReferenceJobId((current) => {
                    if (!current) return null;
                    const selected = referenceJobOptions.find((row) => row.id === current);
                    if (!selected) return null;
                    const isMsp =
                      String(selected.source_type ?? "").trim().toLowerCase() === "msp";
                    return value === isMsp ? current : null;
                  });
                }}
                mspPlacementType={mspPlacementType}
                onMspPlacementTypeChange={(value) => {
                  setMspPlacementType(value);
                  setFieldErrors((current) => {
                    const next = { ...current };
                    delete next.mspPlacementType;
                    return next;
                  });
                  setReferenceJobId((current) => {
                    if (!current) return null;
                    const selected = referenceJobOptions.find((row) => row.id === current);
                    if (!selected) return null;
                    const isMsp =
                      String(selected.source_type ?? "").trim().toLowerCase() === "msp";
                    if (!isMsp) return null;
                    const selectedPlacement = placementTypeFromApiRow(
                      "MSP",
                      selected.placement_type,
                      selected.employment_type
                    );
                    return selectedPlacement === value ? current : null;
                  });
                }}
                jobs={referenceJobOptions}
                jobsLoading={referenceJobsLoading}
                selectedReferenceJobId={referenceJobId}
                onSelectReferenceJob={setReferenceJobId}
                fieldErrors={fieldErrors}
              />
            ) : null}

            {step === "requisition" ? (
              <>
                <JobFormStepRequisition
                  job={job}
                  ui={ui}
                  fieldErrors={fieldErrors}
                  professions={options?.professions ?? []}
                  employmentTypes={options?.employmentTypes ?? ["W2", "1099"]}
                  onJobChange={updateJob}
                  onUiChange={updateUi}
                  onServiceAreaBlockedChange={onServiceAreaBlockedChange}
                />
                <JobFormWorkflowBanner
                  workflowName={workflow?.workflowName}
                  workflowWarning={workflowWarning}
                  mappingCriteria={workflow?.mappingCriteria}
                  mappingLink={mappingLink}
                  canManageWorkflows={Boolean(options?.canManageWorkflows)}
                  fieldError={fieldErrors.workflowId}
                  assignmentMode={assignmentMode}
                  publishedWorkflows={options?.workflows ?? []}
                  overrideWorkflowId={overrideWorkflowId}
                  hideUnmappedDetails={job.sourceType === "MSP"}
                  showMappingLink={job.sourceType !== "MSP"}
                  onOverrideWorkflow={(workflowId) => {
                    setAssignmentMode("manual");
                    setOverrideWorkflowId(workflowId);
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.workflowId;
                      return next;
                    });
                  }}
                  onResetToAutomatic={() => {
                    setAssignmentMode("automatic");
                    setOverrideWorkflowId(null);
                  }}
                />
              </>
            ) : null}

            {step === "msp-details" ? (
              <>
                <JobFormStepMspDetails
                  job={job}
                  ui={ui}
                  fieldErrors={fieldErrors}
                  professions={options?.professions ?? []}
                  onJobChange={updateJob}
                  onUiChange={updateUi}
                  onServiceAreaBlockedChange={onServiceAreaBlockedChange}
                />
                <JobFormWorkflowBanner
                  workflowName={workflow?.workflowName}
                  workflowWarning={workflowWarning}
                  mappingCriteria={workflow?.mappingCriteria}
                  mappingLink={mappingLink}
                  canManageWorkflows={Boolean(options?.canManageWorkflows)}
                  fieldError={fieldErrors.workflowId}
                  assignmentMode={assignmentMode}
                  publishedWorkflows={options?.workflows ?? []}
                  overrideWorkflowId={overrideWorkflowId}
                  hideUnmappedDetails
                  showMappingLink={false}
                  onOverrideWorkflow={(workflowId) => {
                    setAssignmentMode("manual");
                    setOverrideWorkflowId(workflowId);
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.workflowId;
                      return next;
                    });
                  }}
                  onResetToAutomatic={() => {
                    setAssignmentMode("automatic");
                    setOverrideWorkflowId(null);
                  }}
                />
              </>
            ) : null}

            {step === "compensation" ? (
              <JobFormStepCompensation
                job={job}
                ui={ui}
                fieldErrors={fieldErrors}
                onJobChange={updateJob}
                onUiChange={updateUi}
              />
            ) : null}

            {step === "description" ? (
              <JobFormStepDescription
                job={job}
                ui={ui}
                fieldErrors={fieldErrors}
                onJobChange={updateJob}
                professionName={professionLabel}
                specialtyName={specialtyLabel}
                companyName={branding.companyName}
                brandStyle={brandStyle}
                screeningQuestions={screeningQuestions}
                onScreeningQuestionsChange={setScreeningQuestions}
              />
            ) : null}

            {step === "review" ? (
              <JobFormStepReview
                job={buildPayloadJob()}
                ui={ui}
                professionName={professionLabel}
                onEditField={setReviewEditField}
                brandVars={brandVars}
                fieldErrors={fieldErrors}
                onServiceAreaBlockedChange={onServiceAreaBlockedChange}
              />
            ) : null}
          </div>

          {step === "setup" ? (
            <div className="mt-8 flex flex-col-reverse gap-2 border-t border-[#E5E7EB] pt-5 min-[350px]:flex-row min-[350px]:items-center min-[700px]:justify-between">
              <Link
                href="/admin_recruiter/jobs"
                className={`${JOB_FORM_OUTLINE_BUTTON_CLASS} w-full min-[350px]:w-auto min-[350px]:flex-1 min-[700px]:flex-none text-center no-underline`}
              >
                Cancel
              </Link>
              <button
                type="button"
                className={`${JOB_FORM_PRIMARY_BUTTON_CLASS} w-full min-[350px]:w-auto min-[350px]:flex-1 min-[700px]:flex-none`}
                style={brandStyle}
                disabled={setupBusy}
                onClick={() => void handleSetupContinue()}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <JobFormFooter
              step={step}
              saving={saving}
              canPublish={!requiresWorkflow || Boolean(workflow)}
              showPublishActions={showPublishActions && originalStatus !== "published"}
              termsAccepted={termsAccepted}
              brandStyle={brandStyle}
              saveDraftLabel={
                serviceAreaBlocked || originalStatus === "draft" ? "Save draft" : "Save"
              }
              onBack={handleBack}
              onNext={handleNext}
              onPreview={() => setPreviewOpen(true)}
              onSaveDraft={() => {
                // Restricted locations always save as draft (demotes a live job to draft).
                // Published jobs with allowed locations keep Save → publish.
                void save(
                  originalStatus === "published" && !serviceAreaBlocked
                    ? "publish"
                    : "save_draft"
                );
              }}
              onPublish={() => void save("publish")}
              onTermsChange={setTermsAccepted}
              termsHref={tenantTermsHref}
              privacyHref={privacyPolicyHref}
            />
          )}

          {originalStatus === "published" && step === "review" ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={saving || serviceAreaBlocked}
                onClick={() => void save("publish")}
                title={
                  serviceAreaBlocked
                    ? serviceAreaBlockMessage || SERVICE_AREA_COPY.location_not_enabled
                    : undefined
                }
                className="cursor-pointer text-sm font-medium text-[color:var(--brand-primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Update published job
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <JobReviewEditModal
        open={reviewEditField != null}
        field={reviewEditField}
        job={job}
        ui={ui}
        brandStyle={brandStyle}
        brandVars={brandVars}
        professions={options?.professions ?? []}
        employmentTypes={options?.employmentTypes ?? ["W2", "1099", "Contract"]}
        sourceTypes={options?.sourceTypes ?? ["Internal", "MSP"]}
        employerOfRecordOptions={options?.employerOfRecordOptions ?? []}
        onOpenChange={(open) => {
          if (!open) setReviewEditField(null);
        }}
        onUpdate={({ job: nextJob, ui: nextUi }) => {
          setJob(nextJob);
          setUi(nextUi);
          setFieldErrors((current) => {
            const next = { ...current };
            delete next.remoteAllowedStates;
            delete next.location;
            return next;
          });
          setMessage("");
          setReviewEditField(null);
        }}
        onServiceAreaBlockedChange={onServiceAreaBlockedChange}
      />

      <JobPostPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        job={buildPayloadJob()}
        ui={ui}
        companyName={branding.companyName}
        brandStyle={brandStyle}
        brandVars={brandVars}
      />
    </main>
  );
}
