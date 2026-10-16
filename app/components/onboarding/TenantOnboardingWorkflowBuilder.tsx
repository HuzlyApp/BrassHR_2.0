"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";

import BuilderWorkflowHeaderSlots from "@/app/admin_recruiter/components/BuilderWorkflowHeaderSlots";
import { useOptionalWorkflowDashboardHeader } from "@/app/admin_recruiter/components/WorkflowDashboardHeaderContext";
import SuccessModal from "@/app/components/SuccessModal";
import { WorkflowBuilder } from "@/app/components/workflow-builder";
import type { StepCategory } from "@/app/components/workflow-builder";
import type { WorkflowNodeData, WorkflowState } from "@/app/components/workflow-builder";
import {
  hydrateWorkflowStepLibrary,
} from "@/app/components/onboarding/workflow-step-library";
import type { WorkflowStepLibraryCategory } from "@/lib/onboarding/workflow-step-library-data";
import {
  hydrateCanvasFromBuilderDraft,
  hydrateCanvasFromFlowDraft,
  hydrateDraftCanvas,
  hydratePublishedCanvas,
  selectBuilderCanvas,
} from "@/lib/onboarding/select-builder-canvas";
import type { TenantOnboardingConfig } from "@/lib/onboarding/types";
import { safeFetchJson } from "@/lib/api/safe-fetch-json";
import { applyApplicantConfigFilters } from "@/lib/onboarding/filter-applicant-steps";
import { configFromWorkflowDraft } from "@/lib/onboarding/config-from-builder-draft";
import { isValidFlowNameInput, normalizeFlowNameKey } from "@/lib/onboarding/validate-flow-name";
import { FLOWS_QUERY_KEY } from "@/lib/onboarding/hooks/use-onboarding-flows";
import { TEMPLATES_QUERY_KEY } from "@/lib/onboarding/hooks/use-onboarding-templates";
import { resolveWorkflowPersistTarget } from "@/lib/onboarding/workflow-template-persist";
import { isSerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";
import {
  clearPendingWorkflowPaste,
  isPendingWorkflowPaste,
} from "@/lib/onboarding/workflow-template-pending-paste";
import { writeOnboardingPreview } from "@/lib/onboarding/onboarding-preview-storage";
import { buildWorkflowTestUrl } from "@/lib/onboarding/workflow-test-session";
import { PUBLISH_SUCCESS_MESSAGE } from "@/lib/onboarding/prepare-published-step-drafts";
import { serializeWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";
import { staffAuthHeaders, staffFetchInit } from "@/lib/staff-auth-headers";
import {
  OnboardingBuilderErrorPanel,
  OnboardingBuilderSaveErrorBanner,
} from "@/app/components/onboarding/OnboardingBuilderErrorPanel";
import CandidateDetailLoader from "@/app/admin_recruiter/components/CandidateDetailLoader";

type BuilderPayload = {
  config?: TenantOnboardingConfig;
  tenantId?: string;
  tenantName?: string | null;
  flowName?: string;
  publishStatus?: "draft" | "published";
  builderDraft?: unknown;
  builderUpdatedAt?: string | null;
  tenantSlug?: string | null;
  error?: string;
  detail?: string;
  code?: string;
};

type BuilderQueryData = {
  payload: BuilderPayload;
  stepLibrary: StepCategory[];
  initialNodes: Node<WorkflowNodeData>[];
  initialEdges: Edge[];
};

type WorkflowTemplateListItem = {
  id: string;
  name: string;
  folder: "presets" | "saved-templates";
  isPreset: boolean;
  status?: "draft" | "published" | "unpublished";
  employmentType?: "W2" | "1099" | "RNR" | null;
  flowName: string | null;
  updatedAt: string;
};

type EditingTemplate = {
  id: string;
  name: string;
  folder: "presets" | "saved-templates";
  isReadOnly: boolean;
  isViewOnly?: boolean;
  status?: "draft" | "published" | "unpublished";
  employmentType?: "W2" | "1099" | "RNR" | null;
  updatedAt: string | null;
};

type SuccessModalState = {
  open: boolean;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

const BUILDER_STALE_TIME_MS = 5 * 60 * 1000;
const BUILDER_GC_TIME_MS = 10 * 60 * 1000;
const BUILDER_QUERY_KEY = ["onboarding-builder", "effective-tenant"] as const;

function logBuilderDiagnostic(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[OnboardingBuilder] ${message}`, details ?? {});
  }
}

async function loadBuilderData(): Promise<BuilderQueryData> {
  const headers = await staffAuthHeaders();
  const fetchOptions: RequestInit = { headers, credentials: "include" };
  const [libraryRes, res] = await Promise.all([
    safeFetchJson<{ categories?: WorkflowStepLibraryCategory[]; error?: string }>(
      "/api/admin/onboarding-builder/steps-library",
      fetchOptions
    ),
    safeFetchJson<BuilderPayload>("/api/admin/onboarding-builder", fetchOptions),
  ]);

  if (!libraryRes.ok || !libraryRes.data.categories?.length) {
    throw new Error(
      (!libraryRes.ok ? libraryRes.error : null) ??
        libraryRes.data?.error ??
        "Step library is not configured. Add steps in Supabase onboarding_step_library."
    );
  }

  const stepLibrary = hydrateWorkflowStepLibrary(libraryRes.data.categories);

  if (!res.ok) {
    throw new Error(
      res.data?.detail ?? res.data?.error ?? res.error ?? "Could not load onboarding builder"
    );
  }

  const payload = res.data;

  const config = payload.config;
  if (!config || !payload.tenantId) {
    throw new Error("Onboarding configuration is missing for this tenant.");
  }

  const canvas = selectBuilderCanvas(payload, stepLibrary);
  logBuilderDiagnostic("hydrated builder canvas", {
    source: canvas.source,
    publishStatus: payload.publishStatus,
    nodeCount: canvas.nodes.length,
  });

  return {
    payload,
    stepLibrary,
    initialNodes: canvas.nodes,
    initialEdges: canvas.edges,
  };
}

export type TenantOnboardingWorkflowBuilderProps = {
  /** Settings uses a compact card; dashboard fills the workspace below sub-nav. */
  variant?: "settings" | "dashboard";
};

export default function TenantOnboardingWorkflowBuilder({
  variant = "dashboard",
}: TenantOnboardingWorkflowBuilderProps = {}) {
  const isDashboard = variant === "dashboard";
  const workflowHeader = useOptionalWorkflowDashboardHeader();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateIdFromUrl = searchParams.get("template")?.trim() || null;
  const flowIdFromUrl = searchParams.get("flow")?.trim() || null;
  const templateViewOnly = searchParams.get("view") === "1";
  const queryClient = useQueryClient();
  const prevPathnameRef = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGenerationRef = useRef(0);
  const prevStepCountRef = useRef(0);
  const skipNextChange = useRef(true);
  const latestStateRef = useRef<WorkflowState>({ nodes: [], edges: [] });
  const lastPersistOptionsRef = useRef<{ publish?: boolean; template?: boolean; silent?: boolean }>(
    {}
  );
  const prevTemplateIdRef = useRef<string | null>(null);
  const initializedTenantRef = useRef<string | null>(null);
  const lastAppliedPublishedVersionRef = useRef<number | null>(null);
  const flowTitleRef = useRef("");
  const savedFlowTitleRef = useRef("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingPublish, setSavingPublish] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [flowTitle, setFlowTitle] = useState("");
  const [publishStatus, setPublishStatus] = useState<"draft" | "published">("published");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [stepLibrary, setStepLibrary] = useState<StepCategory[]>([]);
  const [initialNodes, setInitialNodes] = useState<Node<WorkflowNodeData>[]>([]);
  const [initialEdges, setInitialEdges] = useState<Edge[]>([]);
  const [activeFlowKey, setActiveFlowKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dismissedLoadError, setDismissedLoadError] = useState<string | null>(null);
  const [templateLists, setTemplateLists] = useState<{
    presets: WorkflowTemplateListItem[];
    savedTemplates: WorkflowTemplateListItem[];
  }>({ presets: [], savedTemplates: [] });
  const [editingTemplate, setEditingTemplate] = useState<EditingTemplate | null>(null);
  const [editingFlow, setEditingFlow] = useState<{ id: string; updatedAt: string | null } | null>(
    null
  );
  const [templateUpdatedAt, setTemplateUpdatedAt] = useState<string | null>(null);
  const [pastingWorkflow, setPastingWorkflow] = useState(false);
  const [deletingWorkflow, setDeletingWorkflow] = useState(false);
  const [successModal, setSuccessModal] = useState<SuccessModalState>({
    open: false,
    title: "Success!",
    message: "",
  });

  const {
    data,
    error: queryError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: BUILDER_QUERY_KEY,
    queryFn: async () => {
      logBuilderDiagnostic("fetching builder data", { queryKey: BUILDER_QUERY_KEY });
      return loadBuilderData();
    },
    staleTime: BUILDER_STALE_TIME_MS,
    gcTime: BUILDER_GC_TIME_MS,
    refetchInterval: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!data) return;

    const payload = data.payload;
    const nextTenantId = payload.tenantId ?? null;
    const waitingForFreshFetch = isFetching && initializedTenantRef.current === null;

    logBuilderDiagnostic("applying fetched builder data", {
      tenantId: nextTenantId,
      flowName: payload.flowName,
      configVersion: payload.config?.version,
      publishStatus: payload.publishStatus,
      isBackgroundRefresh: !isLoading,
      isFetching,
      templateIdFromUrl,
    });

    setTenantId(nextTenantId);
    setTenantSlug(payload.tenantSlug?.trim() || null);
    setTenantName(payload.tenantName?.trim() || "Your organization");
    setStepLibrary(data.stepLibrary);

    if (templateIdFromUrl || flowIdFromUrl) {
      return;
    }

    setEditingTemplate(null);
    setTemplateUpdatedAt(null);

    const nextFlowName = payload.flowName?.trim() ?? "";
    const tenantFlowKey = `${nextTenantId ?? "none"}:tenant-flow`;
    const cameFromTemplate = activeFlowKey?.includes(":template:") ?? false;
    const tenantChanged = initializedTenantRef.current !== nextTenantId;
    const isFirstTenantLoad = activeFlowKey == null;
    const shouldApplyFlowName = cameFromTemplate || tenantChanged || isFirstTenantLoad;

    if (shouldApplyFlowName) {
      setFlowTitle(nextFlowName);
      flowTitleRef.current = nextFlowName;
      savedFlowTitleRef.current = nextFlowName;
    }

    if (waitingForFreshFetch) return;

    const publishedVersion = payload.config?.version ?? 0;
    const publishedRevisionChanged =
      publishedVersion !== lastAppliedPublishedVersionRef.current;
    const shouldApplyCanvas =
      cameFromTemplate ||
      tenantChanged ||
      isFirstTenantLoad ||
      publishedRevisionChanged;

    if (shouldApplyCanvas) {
      setInitialNodes(data.initialNodes);
      setInitialEdges(data.initialEdges);
      prevStepCountRef.current = data.initialNodes.filter((n) => n.type === "step").length;
      setActiveFlowKey(`${tenantFlowKey}:v${publishedVersion}`);
      initializedTenantRef.current = nextTenantId;
      lastAppliedPublishedVersionRef.current = publishedVersion;
      skipNextChange.current = true;
      setPublishStatus(payload.publishStatus ?? "published");
      setUpdatedAt(payload.builderUpdatedAt ?? null);
    }
  }, [activeFlowKey, data, flowIdFromUrl, isFetching, isLoading, templateIdFromUrl]);

  useEffect(() => {
    const prevTemplateId = prevTemplateIdRef.current;
    prevTemplateIdRef.current = templateIdFromUrl;
    if (prevTemplateId && !templateIdFromUrl) {
      setEditingTemplate(null);
      setTemplateUpdatedAt(null);
      setActiveFlowKey(null);
      initializedTenantRef.current = null;
      lastAppliedPublishedVersionRef.current = null;
      void refetch();
    }
  }, [templateIdFromUrl, refetch]);

  useEffect(() => {
    if (!flowIdFromUrl) {
      setEditingFlow(null);
      return;
    }
    if (!tenantId) return;
    let cancelled = false;

    async function loadFlow() {
      try {
        const res = await fetch(
          `/api/admin/onboarding-flows/${flowIdFromUrl}`,
          await staffFetchInit()
        );
        const payload = (await res.json()) as {
          flow?: {
            id: string;
            name: string;
            status: "draft" | "published" | "unpublished";
            builderDraft: unknown;
            updatedAt: string;
          };
          error?: string;
        };
        if (!res.ok) throw new Error(payload.error || "Failed to load flow");
        if (cancelled || !payload.flow) return;

        const flow = payload.flow;
        const builderPayload = data?.payload;
        const { nodes, edges } = hydrateCanvasFromFlowDraft(
          flow.builderDraft,
          {
            config: builderPayload?.config,
            publishStatus: builderPayload?.publishStatus,
            builderDraft: builderPayload?.builderDraft,
          },
          stepLibrary
        );

        setEditingFlow({ id: flow.id, updatedAt: flow.updatedAt });
        setEditingTemplate(null);
        setTemplateUpdatedAt(null);
        setInitialNodes(nodes);
        setInitialEdges(edges);
        setFlowTitle(flow.name);
        flowTitleRef.current = flow.name;
        savedFlowTitleRef.current = flow.name;
        setPublishStatus(flow.status === "published" ? "published" : "draft");
        setUpdatedAt(flow.updatedAt);
        setActiveFlowKey(`${tenantId}:flow:${flow.id}`);
        skipNextChange.current = true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load flow");
      }
    }

    void loadFlow();
    return () => {
      cancelled = true;
    };
  }, [data, flowIdFromUrl, tenantId, stepLibrary]);

  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    const onBuilder = pathname.includes("/onboarding-builder");
    const wasOnBuilder = prev?.includes("/onboarding-builder") ?? false;
    if (onBuilder && !wasOnBuilder && !templateIdFromUrl && !flowIdFromUrl) {
      setEditingTemplate(null);
      setEditingFlow(null);
      setTemplateUpdatedAt(null);
      setActiveFlowKey(null);
      initializedTenantRef.current = null;
      lastAppliedPublishedVersionRef.current = null;
      void queryClient.invalidateQueries({ queryKey: BUILDER_QUERY_KEY });
    }
  }, [pathname, templateIdFromUrl, flowIdFromUrl, queryClient]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  const loadTemplateLists = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/workflow-templates", await staffFetchInit());
      const payload = (await res.json()) as {
        presets?: WorkflowTemplateListItem[];
        savedTemplates?: WorkflowTemplateListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to load templates");
      setTemplateLists({
        presets: payload.presets ?? [],
        savedTemplates: payload.savedTemplates ?? [],
      });
    } catch (e) {
      logBuilderDiagnostic("template list load failed", {
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }, []);

  useEffect(() => {
    void loadTemplateLists();
  }, [loadTemplateLists]);

  useEffect(() => {
    if (!templateIdFromUrl || !tenantId) return;
    let cancelled = false;

    async function loadTemplate() {
      try {
        const res = await fetch(
          `/api/admin/workflow-templates/${templateIdFromUrl}`,
          await staffFetchInit()
        );
        const payload = (await res.json()) as {
          template?: {
            id: string;
            name: string;
            folder: "presets" | "saved-templates";
            isReadOnly?: boolean;
            status?: "draft" | "published" | "unpublished";
            employmentType?: "W2" | "1099" | "RNR" | null;
            flowName: string | null;
            builderDraft: unknown;
            updatedAt?: string;
          };
          error?: string;
        };
        if (!res.ok) throw new Error(payload.error || "Failed to load template");
        if (cancelled || !payload.template) return;

        const template = payload.template;
        const { nodes, edges } = hydrateCanvasFromBuilderDraft(
          isSerializableWorkflowState(template.builderDraft)
            ? template.builderDraft
            : { nodes: [], edges: [] },
          stepLibrary
        );
        const displayTitle =
          template.flowName?.trim() || template.name.replace(/\.tpl$/i, "");

        setEditingTemplate({
          id: template.id,
          name: template.name,
          folder: template.folder,
          isReadOnly: template.isReadOnly === true,
          isViewOnly: templateViewOnly,
          status: template.status,
          employmentType: template.employmentType ?? null,
          updatedAt: template.updatedAt ?? null,
        });
        setTemplateUpdatedAt(template.updatedAt ?? null);
        setInitialNodes(nodes);
        setInitialEdges(edges);
        setFlowTitle(displayTitle);
        flowTitleRef.current = displayTitle;
        savedFlowTitleRef.current = displayTitle;
        setPublishStatus(
          template.isReadOnly === true
            ? "draft"
            : template.status === "published"
              ? "published"
              : "draft"
        );
        setActiveFlowKey(`${tenantId}:template:${templateIdFromUrl}:${template.updatedAt ?? "new"}`);
        skipNextChange.current = true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load template");
      }
    }

    void loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [templateIdFromUrl, tenantId, stepLibrary, templateViewOnly]);

  const persistTemplateUpdate = useCallback(
    async (
      state: WorkflowState,
      options: { template?: boolean; silent?: boolean; publish?: boolean },
      templateId: string
    ) => {
      const builderDraft = serializeWorkflowState(state.nodes, state.edges);
      const res = await fetch(`/api/admin/workflow-templates/${templateId}`, {
        ...(await staffFetchInit({
          "Content-Type": "application/json",
        })),
        method: "PATCH",
        body: JSON.stringify({
          name: flowTitleRef.current,
          flowName: flowTitleRef.current,
          builderDraft,
          ...(options.publish ? { publish: true } : { status: "draft" }),
        }),
      });
      const payload = (await res.json()) as {
        template?: WorkflowTemplateListItem;
        appliedFlowId?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to save template");

      const saved = payload.template;
      if (!saved?.id) throw new Error("Template was not updated");
      if (options.publish && saved.status !== "published") {
        throw new Error("Template was not published");
      }

      const displayTitle = saved.flowName?.trim() || saved.name.replace(/\.tpl$/i, "");
      flowTitleRef.current = displayTitle;
      savedFlowTitleRef.current = displayTitle;
      setFlowTitle(displayTitle);
      setEditingTemplate((prev) =>
        prev
          ? {
              ...prev,
              id: saved.id,
              name: saved.name,
              folder: "saved-templates",
              isReadOnly: false,
              status: saved.status,
              employmentType: saved.employmentType,
              updatedAt: saved.updatedAt,
            }
          : prev
      );
      setTemplateUpdatedAt(saved.updatedAt);
      setPublishStatus(saved.status === "published" ? "published" : "draft");
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
      if (options.publish) {
        void queryClient.invalidateQueries({ queryKey: FLOWS_QUERY_KEY });
      }

      if (!options.silent) {
        void loadTemplateLists();
        if (options.publish) {
          setSuccessModal({
            open: true,
            title: "Success!",
            message: payload.appliedFlowId
              ? `"${displayTitle}" is published and will be used for new matching applications.`
              : `"${displayTitle}" is published.`,
            actionHref: "/admin_recruiter/dashboard/templates",
            actionLabel: "View templates",
          });
        } else if (options.template) {
          setSuccessModal({
            open: true,
            title: "Success!",
            message: `Template "${saved.name}" has been saved`,
            actionHref: "/admin_recruiter/dashboard/templates",
            actionLabel: "View templates",
          });
        } else {
          toast.success("Template saved");
        }
      }
    },
    [loadTemplateLists, queryClient]
  );

  const persistNewTemplate = useCallback(
    async (state: WorkflowState, options: { silent?: boolean; publish?: boolean }) => {
      const builderDraft = serializeWorkflowState(state.nodes, state.edges);
      const res = await fetch("/api/admin/workflow-templates", {
        ...(await staffFetchInit({
          "Content-Type": "application/json",
        })),
        method: "POST",
        body: JSON.stringify({
          name: flowTitleRef.current,
          folder: "saved-templates",
          flowName: flowTitleRef.current,
          builderDraft,
          publish: options.publish === true,
        }),
      });
      const payload = (await res.json()) as {
        template?: WorkflowTemplateListItem;
        appliedFlowId?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Failed to save template");

      const saved = payload.template;
      if (!saved?.id) throw new Error("Template was not created");
      if (options.publish && saved.status !== "published") {
        throw new Error("Template was not published");
      }

      const displayTitle = saved.flowName?.trim() || saved.name.replace(/\.tpl$/i, "");
      flowTitleRef.current = displayTitle;
      savedFlowTitleRef.current = displayTitle;
      setFlowTitle(displayTitle);
      setEditingTemplate({
        id: saved.id,
        name: saved.name,
        folder: "saved-templates",
        isReadOnly: false,
        status: saved.status,
        employmentType: saved.employmentType,
        updatedAt: saved.updatedAt,
      });
      setTemplateUpdatedAt(saved.updatedAt);
      setPublishStatus(saved.status === "published" ? "published" : "draft");
      setActiveFlowKey(`${tenantId ?? "none"}:template:${saved.id}:${saved.updatedAt}`);
      skipNextChange.current = true;

      const params = new URLSearchParams(searchParams.toString());
      params.set("template", saved.id);
      params.delete("view");
      router.replace(`${pathname}?${params.toString()}`);

      void queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
      if (options.publish) {
        void queryClient.invalidateQueries({ queryKey: FLOWS_QUERY_KEY });
      }

      if (!options.silent) {
        void loadTemplateLists();
        if (options.publish) {
          setSuccessModal({
            open: true,
            title: "Success!",
            message: payload.appliedFlowId
              ? `"${displayTitle}" is published and will be used for new matching applications.`
              : `"${displayTitle}" is published.`,
            actionHref: "/admin_recruiter/dashboard/templates",
            actionLabel: "View templates",
          });
        } else {
          setSuccessModal({
            open: true,
            title: "Success!",
            message: `Template "${saved.name}" has been saved`,
            actionHref: "/admin_recruiter/dashboard/templates",
            actionLabel: "View templates",
          });
        }
      }
    },
    [loadTemplateLists, pathname, queryClient, router, searchParams, tenantId]
  );

  const persist = useCallback(
    async (
      state: WorkflowState,
      options: {
        publish?: boolean;
        template?: boolean;
        silent?: boolean;
        flowName?: string;
        saveGeneration?: number;
      }
    ) => {
      if (editingTemplate?.isViewOnly) return;
      const saveGeneration = options.saveGeneration;
      const effectiveFlowName = (options.flowName ?? flowTitleRef.current).trim();
      if (!options.silent) {
        if (options.template) setSavingTemplate(true);
        else if (options.publish) setSavingPublish(true);
      }
      setLocalError(null);
      lastPersistOptionsRef.current = options;
      try {
        const persistTarget = resolveWorkflowPersistTarget({
          viewOnly: editingTemplate?.isViewOnly,
          editingTemplate: editingTemplate
            ? { id: editingTemplate.id, isReadOnly: editingTemplate.isReadOnly }
            : null,
          flowId: flowIdFromUrl,
          options,
        });

        if (persistTarget.action === "noop") return;

        if (
          persistTarget.action === "fork-preset" ||
          persistTarget.action === "create-saved-template"
        ) {
          await persistNewTemplate(state, {
            silent: options.silent,
            publish: persistTarget.publish,
          });
          return;
        }

        if (persistTarget.action === "update-template") {
          await persistTemplateUpdate(
            state,
            {
              template: options.template,
              silent: options.silent,
              publish: persistTarget.publish,
            },
            persistTarget.templateId
          );
          return;
        }

        const builderDraft = serializeWorkflowState(state.nodes, state.edges);

        const activeFlowId =
          persistTarget.action === "update-flow" ? persistTarget.flowId : null;
        if (activeFlowId) {
          const patchBody: Record<string, unknown> = {
            name: effectiveFlowName,
            builderDraft,
            saveTemplate: options.template === true,
            templateName: flowTitleRef.current,
          };
          if (options.publish === true) {
            patchBody.publish = true;
          }

          const res = await fetch(`/api/admin/onboarding-flows/${activeFlowId}`, {
            ...(await staffFetchInit({
              "Content-Type": "application/json",
            })),
            method: "PATCH",
            body: JSON.stringify(patchBody),
          });
          const payload = (await res.json()) as {
            flow?: {
              id: string;
              name: string;
              status: string;
              updatedAt: string;
            };
            error?: string;
          };
          if (!res.ok) throw new Error(payload.error || "Save failed");

          const saved = payload.flow;
          const savedAt = saved?.updatedAt ?? new Date().toISOString();
          const savedName = saved?.name?.trim() || effectiveFlowName;
          flowTitleRef.current = savedName;
          savedFlowTitleRef.current = savedName;
          setFlowTitle(savedName);
          setUpdatedAt(savedAt);
          if (saved) {
            setEditingFlow({ id: saved.id, updatedAt: savedAt });
            setPublishStatus(saved.status === "published" ? "published" : "draft");
          }

          const library = data?.stepLibrary ?? stepLibrary;
          const savedCanvas = hydrateCanvasFromBuilderDraft(builderDraft, library, {
            allowEmpty: true,
            enforceResumeFirst: false,
          });
          setInitialNodes(savedCanvas.nodes);
          setInitialEdges(savedCanvas.edges);
          skipNextChange.current = true;

          if (!options.silent) {
            if (options.template) {
              void loadTemplateLists();
              setSuccessModal({
                open: true,
                title: "Success!",
                message: `Template "${flowTitleRef.current}" has been saved`,
                actionHref: "/admin_recruiter/dashboard/templates",
                actionLabel: "View templates",
              });
            } else if (options.publish) {
              setSuccessModal({
                open: true,
                title: "Success!",
                message: PUBLISH_SUCCESS_MESSAGE,
              });
              void queryClient.invalidateQueries({ queryKey: BUILDER_QUERY_KEY });
              void queryClient.invalidateQueries({ queryKey: FLOWS_QUERY_KEY });
            } else {
              toast.success("Draft saved");
            }
          }
          return;
        }

        const endpoint = options.publish
          ? "/api/admin/onboarding-builder/publish"
          : "/api/admin/onboarding-builder/save";
        const res = await fetch(endpoint, {
          ...(await staffFetchInit({
            "Content-Type": "application/json",
          })),
          method: "POST",
          body: JSON.stringify({
            builderDraft,
            flowName: effectiveFlowName,
            publish: options.publish === true,
          }),
        });
        const payload = (await res.json()) as BuilderPayload;
        if (!res.ok) {
          throw new Error(payload.detail ?? payload.error ?? "Save failed");
        }

        if (saveGeneration != null && saveGeneration !== saveGenerationRef.current) {
          return;
        }

        const savedAt = payload.builderUpdatedAt ?? null;

        const savedName = payload.flowName?.trim() || effectiveFlowName;
        flowTitleRef.current = savedName;
        savedFlowTitleRef.current = savedName;
        setFlowTitle(savedName);

        const serializedDraft = builderDraft;
        const library = data?.stepLibrary ?? stepLibrary;
        const publishedCanvas = hydratePublishedCanvas(
          {
            ...data?.payload,
            config: payload.config ?? data?.payload.config,
            publishStatus: "published",
          },
          library
        );
        const draftCanvas = hydrateCanvasFromBuilderDraft(serializedDraft, library);

        if (options.publish) {
          setPublishStatus("published");
          setUpdatedAt(savedAt);
          const publishedVersion = payload.config?.version ?? 0;
          setInitialNodes(publishedCanvas.nodes);
          setInitialEdges(publishedCanvas.edges);
          setActiveFlowKey(`${tenantId ?? "none"}:tenant-flow:v${publishedVersion}`);
          lastAppliedPublishedVersionRef.current = publishedVersion;
          skipNextChange.current = true;
        } else if (payload.publishStatus) {
          setPublishStatus(payload.publishStatus);
          if (payload.builderUpdatedAt !== undefined) {
            setUpdatedAt(payload.builderUpdatedAt ?? null);
          }
          setInitialNodes(draftCanvas.nodes);
          setInitialEdges(draftCanvas.edges);
          skipNextChange.current = true;
        }

        queryClient.setQueryData<BuilderQueryData>(BUILDER_QUERY_KEY, (current) =>
          current
            ? {
                ...current,
                initialNodes: options.publish ? publishedCanvas.nodes : draftCanvas.nodes,
                initialEdges: options.publish ? publishedCanvas.edges : draftCanvas.edges,
                payload: {
                  ...current.payload,
                  config: payload.config ?? current.payload.config,
                  flowName: savedName,
                  publishStatus: payload.publishStatus ?? current.payload.publishStatus,
                  builderDraft: serializedDraft,
                  builderUpdatedAt: savedAt,
                },
              }
            : current
        );

        if (!options.silent) {
          if (options.publish) {
            setSuccessModal({
              open: true,
              title: "Success!",
              message: PUBLISH_SUCCESS_MESSAGE,
            });
            void queryClient.invalidateQueries({ queryKey: BUILDER_QUERY_KEY });
          } else {
            toast.success("Draft saved");
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Save failed";
        setLocalError(message);
        if (!options.silent) toast.error(message);
      } finally {
        if (!options.silent) {
          if (options.template) setSavingTemplate(false);
          else if (options.publish) setSavingPublish(false);
        }
      }
    },
    [editingFlow, editingTemplate, flowIdFromUrl, loadTemplateLists, persistNewTemplate, persistTemplateUpdate, queryClient, data?.payload, data?.stepLibrary, stepLibrary, tenantId]
  );

  const handlePreview = useCallback(
    (state: WorkflowState) => {
      const publishedConfig = data?.payload.config;
      if (!publishedConfig || !tenantId) {
        toast.error("Load the workflow before testing.");
        return;
      }
      const builderDraft = serializeWorkflowState(state.nodes, state.edges);
      const previewBase = configFromWorkflowDraft(publishedConfig, builderDraft);
      if (!previewBase) {
        toast.error("This workflow could not be loaded for testing.");
        return;
      }
      const config = applyApplicantConfigFilters(previewBase);
      if (!config.steps.length) {
        toast.error("This workflow has no applicant-visible steps to test.");
        return;
      }
      writeOnboardingPreview({
        tenantId,
        tenantSlug,
        config,
      });
      // Test workflow is draft/workflow-scoped — never open a live job application URL.
      const url = buildWorkflowTestUrl(config, tenantSlug);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Test workflow opened in a new tab");
    },
    [data?.payload.config, tenantId, tenantSlug]
  );

  const handlePasteWorkflow = useCallback(async () => {
    setPastingWorkflow(true);
    try {
      const result = await refetch();
      const queryData = result.data;
      if (!queryData) throw new Error("Could not load workflow");

      const { nodes, edges } = hydrateDraftCanvas(queryData.payload, queryData.stepLibrary);
      if (!nodes.length) {
        toast.error("No copied workflow found. Copy a template first.");
        return;
      }

      const updatedAt = queryData.payload.builderUpdatedAt ?? String(Date.now());
      setEditingTemplate(null);
      setTemplateUpdatedAt(null);
      setInitialNodes(nodes);
      setInitialEdges(edges);
      setPublishStatus("draft");
      setUpdatedAt(updatedAt);
      setActiveFlowKey(`${tenantId ?? "none"}:tenant-flow:paste:${Date.now()}`);
      skipNextChange.current = true;
      clearPendingWorkflowPaste();
      toast.success("Workflow pasted on canvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Paste failed");
    } finally {
      setPastingWorkflow(false);
    }
  }, [refetch, tenantId]);

  const handleDraftChange = useCallback(
    (state: WorkflowState) => {
      latestStateRef.current = state;
      if (editingTemplate?.isViewOnly) return;
      if (skipNextChange.current) {
        skipNextChange.current = false;
        return;
      }
      setPublishStatus("draft");

      const stepCount = state.nodes.filter((n) => n.type === "step").length;
      const isDeletion = stepCount < prevStepCountRef.current;
      prevStepCountRef.current = stepCount;

      const generation = ++saveGenerationRef.current;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

      const runPersist = () => {
        void persist(state, { silent: true, saveGeneration: generation });
      };

      if (isDeletion) {
        runPersist();
        return;
      }

      autosaveTimer.current = setTimeout(runPersist, 900);
    },
    [editingTemplate?.isViewOnly, persist]
  );

  const handleDeleteWorkflow = useCallback(async () => {
    if (!flowIdFromUrl || editingTemplate?.isViewOnly || deletingWorkflow) return;
    const name = flowTitleRef.current.trim() || "this workflow";
    const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingWorkflow(true);
    try {
      const res = await fetch(`/api/admin/onboarding-flows/${flowIdFromUrl}`, {
        ...(await staffFetchInit()),
        method: "DELETE",
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Failed to delete workflow");
      toast.success(`Deleted ${name}`);
      void queryClient.invalidateQueries({ queryKey: FLOWS_QUERY_KEY });
      const flowsPath = pathname.includes("/onboarding-builder")
        ? pathname.replace("/onboarding-builder", "/onboarding-flows")
        : "/admin_recruiter/dashboard/onboarding-flows";
      router.push(flowsPath);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete workflow");
      setDeletingWorkflow(false);
    }
  }, [
    deletingWorkflow,
    editingTemplate?.isViewOnly,
    flowIdFromUrl,
    pathname,
    queryClient,
    router,
  ]);

  const handleResetCanvas = useCallback(() => {
    if (editingTemplate?.isViewOnly) return;
    const confirmed = window.confirm(
      flowIdFromUrl
        ? "Clear every step and start from a blank canvas? The empty workflow is saved."
        : "Clear all steps from the canvas? This stays as draft only and is not saved yet."
    );
    if (!confirmed) return;

    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }

    clearPendingWorkflowPaste();
    skipNextChange.current = true;
    latestStateRef.current = { nodes: [], edges: [] };
    setInitialNodes([]);
    setInitialEdges([]);
    setActiveFlowKey(
      `${tenantId ?? "none"}:${flowIdFromUrl ? `flow:${flowIdFromUrl}:` : ""}blank:${Date.now()}`
    );
    if (flowIdFromUrl) {
      void persist({ nodes: [], edges: [] }, { silent: true });
      toast.success("Blank canvas saved. Add steps from the library.");
    } else {
      setPublishStatus("draft");
      toast.success("Canvas cleared — draft only, not saved");
    }
  }, [editingTemplate?.isViewOnly, flowIdFromUrl, persist, tenantId]);

  const handleFlowTitleChange = useCallback(
    async (nextTitle: string) => {
      if (editingTemplate?.isViewOnly) return;
      const trimmed = nextTitle.trim();
      const validation = isValidFlowNameInput(trimmed);
      if (validation) {
        toast.error(validation);
        const revert = savedFlowTitleRef.current;
        flowTitleRef.current = revert;
        setFlowTitle(revert);
        return;
      }

      const duplicate = templateLists.savedTemplates.some((item) => {
        const existing = normalizeFlowNameKey(item.flowName ?? item.name.replace(/\.tpl$/i, ""));
        return existing === normalizeFlowNameKey(trimmed) &&
          normalizeFlowNameKey(trimmed) !== normalizeFlowNameKey(savedFlowTitleRef.current);
      });
      if (duplicate) {
        toast.error(`A workflow named "${trimmed}" already exists. Please choose another name.`);
        const revert = savedFlowTitleRef.current;
        flowTitleRef.current = revert;
        setFlowTitle(revert);
        return;
      }

      flowTitleRef.current = trimmed;
      setFlowTitle(trimmed);
      setPublishStatus("draft");

      try {
        await persist(latestStateRef.current, { silent: true, flowName: trimmed });
      } catch {
        const revert = savedFlowTitleRef.current;
        flowTitleRef.current = revert;
        setFlowTitle(revert);
      }
    },
    [editingTemplate?.isViewOnly, persist, templateLists.savedTemplates]
  );

  const toolbarData = useMemo(
    () => ({
      templates: [
        ...templateLists.presets.map((item) => ({
          id: item.id,
          name: item.name,
          status: "Preset",
        })),
        ...templateLists.savedTemplates.map((item) => ({
          id: item.id,
          name: item.name,
          status: "Saved",
        })),
      ],
      myFlows: [
        {
          id: tenantId ?? "active-flow",
          name: flowTitle,
          status: publishStatus,
        },
      ],
      library: stepLibrary.map((category) => ({
        id: category.id,
        label: category.label,
        count: category.steps.length,
      })),
      settings: [
        { label: "Tenant", value: tenantName || "Unknown tenant" },
        { label: "Tenant slug", value: tenantSlug ?? "Not set" },
        { label: "Status", value: publishStatus },
        { label: "Last saved", value: updatedAt ? new Date(updatedAt).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Not saved yet" },
      ],
    }),
    [flowTitle, publishStatus, stepLibrary, templateLists, tenantId, tenantName, tenantSlug, updatedAt]
  );

  const loadError =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;
  const saveError = localError;

  useEffect(() => {
    setDismissedLoadError(null);
  }, [loadError]);
  const isTemplateLoading = Boolean(templateIdFromUrl && tenantId && !editingTemplate);
  const isFlowLoading = Boolean(flowIdFromUrl && tenantId && !editingFlow);
  const isBuilderReady = activeFlowKey != null;
  const isBuilderLoading =
    !isBuilderReady && (isLoading || isFetching || isTemplateLoading || isFlowLoading);

  const lastUpdated = useMemo(() => {
    const timestamp = editingTemplate ? templateUpdatedAt : updatedAt;
    if (!timestamp) return undefined;
    const minutesAgo = Math.max(
      0,
      Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000)
    );
    return { author: tenantName || "You", minutesAgo };
  }, [editingTemplate, templateUpdatedAt, tenantName, updatedAt]);

  const statusSuffix = [
    savingTemplate ? "saving template…" : null,
    savingPublish ? "publishing…" : null,
    isFetching && !isLoading ? "refreshing…" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const dashboardShellClass = "flex min-h-0 flex-1 flex-col overflow-hidden";
  const isDraft = publishStatus === "draft";

  const setUndoControlsRef = useRef(workflowHeader?.setUndoControls);
  setUndoControlsRef.current = workflowHeader?.setUndoControls;

  const registerUndoControls = useCallback(
    (
      controls: {
        canUndo: boolean;
        undo: () => void;
        canRedo: boolean;
        redo: () => void;
      } | null
    ) => {
      if (isDashboard) setUndoControlsRef.current?.(controls);
    },
    [isDashboard]
  );

  const handleSaveTemplateFromHeader = useCallback(() => {
    void persist(latestStateRef.current, { template: true });
  }, [persist]);

  const handlePublishFromHeader = useCallback(() => {
    void persist(latestStateRef.current, { publish: true });
  }, [persist]);

  const handlePreviewFromHeader = useCallback(() => {
    handlePreview(latestStateRef.current);
  }, [handlePreview]);

  const loadingState = (
    <CandidateDetailLoader
      label="Loading onboarding builder..."
      className={isDashboard ? "min-h-0 flex-1 bg-transparent" : "min-h-[360px]"}
    />
  );

  const handleRetryLoad = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleRetrySave = useCallback(() => {
    setLocalError(null);
    void persist(latestStateRef.current, lastPersistOptionsRef.current);
  }, [persist]);

  const loadErrorPanel = loadError ? (
    <OnboardingBuilderErrorPanel message={loadError} onRetry={handleRetryLoad} />
  ) : null;

  const isViewOnly = editingTemplate?.isViewOnly === true;

  const canPasteWorkflow = useMemo(() => {
    if (editingTemplate || isViewOnly) return false;
    if (isPendingWorkflowPaste()) return true;
    const payload = data?.payload;
    return (
      payload?.publishStatus === "draft" &&
      isSerializableWorkflowState(payload.builderDraft) &&
      payload.builderDraft.nodes.length > 0
    );
  }, [data?.payload, editingTemplate, isViewOnly]);

  const dashboardHeaderSlots =
    isDashboard && workflowHeader ? (
      <BuilderWorkflowHeaderSlots
        title={flowTitle}
        editableTitle={!isViewOnly}
        onTitleChange={handleFlowTitleChange}
        isDraft={isDraft}
        isEditingTemplate={Boolean(editingTemplate)}
        templateReadOnly={editingTemplate?.isReadOnly || isViewOnly}
        viewOnly={isViewOnly}
        savingTemplate={savingTemplate}
        savingPublish={savingPublish}
        statusSuffix={statusSuffix || undefined}
        onSaveTemplate={handleSaveTemplateFromHeader}
        onPreview={handlePreviewFromHeader}
        onPublish={handlePublishFromHeader}
      />
    ) : null;

  const wrapDashboard = (content: ReactNode) =>
    isDashboard ? (
      <div className={dashboardShellClass}>
        {dashboardHeaderSlots}
        {content}
      </div>
    ) : (
      content
    );

  if (isBuilderLoading) {
    return wrapDashboard(loadingState);
  }

  if (loadErrorPanel && !isBuilderReady) {
    return wrapDashboard(loadErrorPanel);
  }

  const builderContent = (
    <div className={isDashboard ? "flex h-full min-h-0 flex-col overflow-hidden" : "space-y-3"}>
      {saveError ? (
        <OnboardingBuilderSaveErrorBanner
          message={saveError}
          onRetry={handleRetrySave}
          onDismiss={() => setLocalError(null)}
        />
      ) : null}

      {isViewOnly ? (
        <div
          className="mx-4 mt-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-950"
          role="status"
        >
          View only — you cannot change this workflow
        </div>
      ) : null}

      {loadError && isBuilderReady && loadError !== dismissedLoadError ? (
        <OnboardingBuilderSaveErrorBanner
          message={loadError}
          onRetry={handleRetryLoad}
          onDismiss={() => setDismissedLoadError(loadError)}
        />
      ) : null}
      {!isDashboard && editingTemplate ? (
        <div
          className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
          role="status"
        >
          <p className="font-semibold">
            {editingTemplate.isViewOnly
              ? "View only — you cannot change this template"
              : editingTemplate.isReadOnly
                ? "Editing a system preset — Save as Template or Publish creates your own copy. The preset itself is not changed."
                : publishStatus === "published"
                  ? "Editing a saved template — this version is published. Edits save as a draft until you publish again."
                  : "Editing a saved template — changes update this template"}
          </p>
        </div>
      ) : null}
      {!isDashboard && isDraft && !editingTemplate ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">Draft changes are not live until published</p>
          <p className="mt-1 text-amber-900/90">
            Autosave keeps your workflow canvas as a draft. Applicants and recruiters still see the
            last published flow until you click <strong>Publish to All</strong>. Use Preview to test
            the draft in a new tab.
          </p>
        </div>
      ) : null}

      {!isDashboard ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            Configuring: <strong className="text-slate-900">{tenantName}</strong>
            {tenantId ? (
              <span className="ml-2 font-mono text-xs text-slate-400">{tenantId.slice(0, 8)}…</span>
            ) : null}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">
            {publishStatus}
            {statusSuffix ? ` · ${statusSuffix}` : ""}
          </span>
        </div>
      ) : null}

      <div className={isDashboard ? "min-h-0 flex-1" : undefined}>
        <WorkflowBuilder
          embedded={!isDashboard}
          fillParent={isDashboard}
          hideTopChrome={isDashboard}
          hideCanvasHeader={isDashboard}
          registerUndoControls={isDashboard ? registerUndoControls : undefined}
          resetKey={activeFlowKey ?? undefined}
          title={flowTitle}
          subtitle={isDashboard ? undefined : "Applicant onboarding flow"}
          productName="Onboarding Builder"
          brandName={tenantName}
          stepLibrary={stepLibrary}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          lastUpdated={lastUpdated}
          publishStatusLabel={publishStatus === "published" ? "Published" : "Draft"}
          toolbarData={toolbarData}
          editableTitle={!isViewOnly}
          titleCentered={isDashboard}
          onTitleChange={isViewOnly ? undefined : handleFlowTitleChange}
          onChange={handleDraftChange}
          readOnly={isViewOnly}
          canPasteWorkflow={canPasteWorkflow}
          pastingWorkflow={pastingWorkflow}
          onPasteWorkflow={() => void handlePasteWorkflow()}
          onResetCanvas={!isViewOnly && !editingTemplate ? handleResetCanvas : undefined}
          onDeleteWorkflow={
            !isViewOnly && !editingTemplate && flowIdFromUrl
              ? () => void handleDeleteWorkflow()
              : undefined
          }
          deletingWorkflow={deletingWorkflow}
          savingTemplate={savingTemplate}
          savingPublish={savingPublish}
          onSaveAsTemplate={(state) => void persist(state, { template: true })}
          onPreview={handlePreview}
          onPublish={(state) => void persist(state, { publish: true })}
          publishLabel={editingTemplate ? "Publish" : "Publish to All"}
        />
      </div>

      <SuccessModal
        open={successModal.open}
        onClose={() => setSuccessModal((prev) => ({ ...prev, open: false }))}
        title={successModal.title}
        message={successModal.message}
        actionHref={successModal.actionHref}
        actionLabel={successModal.actionLabel}
      />
    </div>
  );

  return wrapDashboard(builderContent);
}
