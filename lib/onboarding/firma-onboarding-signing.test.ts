import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  mapFirmaStatusToOnboardingStatus,
  stepUsesFirmaSigning,
  getFirmaRecruiterTemplateId,
  findOnboardingStepForFirmaSession,
  normalizeFirmaSigningStatus,
  resolveFirmaSigningStatusFromSources,
} from "@/lib/onboarding/firma-step-settings";
import {
  shouldCompleteOnboardingStepFromFirmaStatus,
  FirmaOnboardingSigningError,
  ensureFirmaSigningSession,
  ensureFirmaDraftPreviewSigningSession,
  mapFirmaSigningCreateError,
} from "@/lib/onboarding/firma-onboarding-signing";
import {
  resolveApplicantSigningRecipient,
  resolveFirmaRecipientSigningUrl,
  resolveFirmaSigningIframeUrl,
} from "@/lib/firma/client";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { workflowStateToStepDrafts } from "@/lib/onboarding/workflow-to-drafts";
import { DEFAULT_STEP_SETTINGS } from "@/app/components/workflow-builder/types";
import type { SerializableWorkflowState } from "@/lib/onboarding/workflow-builder-serialization";

const mockEnsureRecruiterTemplateForApplicantSigning = vi.hoisted(() => vi.fn());

vi.mock("@/lib/recruiter-templates/service", () => ({
  ensureRecruiterTemplateForApplicantSigning: mockEnsureRecruiterTemplateForApplicantSigning,
}));

describe("firma step settings", () => {
  it("detects Firma-enabled onboarding steps from workflow settings", () => {
    const step = {
      step_key: "employee_agreement",
      step_type: "authorizations" as const,
      metadata: {
        workflow_settings: {
          ...DEFAULT_STEP_SETTINGS,
          firmaRecruiterTemplateId: "tmpl-local-1",
          firmaRecruiterTemplateName: "Employee Agreement",
        },
      },
    };

    expect(getFirmaRecruiterTemplateId(step)).toBe("tmpl-local-1");
    expect(stepUsesFirmaSigning(step)).toBe(true);
  });

  it("persists attached Firma template settings when publishing workflow drafts", () => {
    const state: SerializableWorkflowState = {
      nodes: [
        {
          id: "node-1",
          stepId: "employee-agreement",
          label: "Employee Agreement",
          description: "Sign agreement",
          position: { x: 0, y: 0 },
          day: 1,
          required: true,
          settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
            firmaRecruiterTemplateName: "Employee Agreement",
          },
        },
      ],
      edges: [],
    };

    const drafts = workflowStateToStepDrafts(state);
    const agreementDraft = drafts.find((draft) =>
      Boolean(getFirmaRecruiterTemplateId(draft as Parameters<typeof getFirmaRecruiterTemplateId>[0]))
    );
    expect(agreementDraft?.metadata?.workflow_settings).toMatchObject({
      firmaRecruiterTemplateId: "recruiter-template-1",
      firmaRecruiterTemplateName: "Employee Agreement",
    });
  });

  it("routes Firma-enabled agreement steps to the agreement signing screen", () => {
    const route = routeForApplicantStep({
      step_key: "employee_agreement",
      step_type: "authorizations",
      metadata: {
        workflow_step_id: "employee-agreement",
        workflow_settings: {
          ...DEFAULT_STEP_SETTINGS,
          firmaRecruiterTemplateId: "recruiter-template-1",
        },
      },
    });

    expect(route).toContain(APPLICATION_ROUTES.agreementSignature);
    expect(route).not.toContain(APPLICATION_ROUTES.firmaSign);
  });

  it("routes Firma-enabled library e-sign steps to the agreement signing screen", () => {
    const route = routeForApplicantStep({
      step_key: "policy_acknowledgment",
      step_type: "custom_question",
      metadata: {
        workflow_step_id: "policy-acknowledgment",
        workflow_settings: {
          ...DEFAULT_STEP_SETTINGS,
          firmaRecruiterTemplateId: "recruiter-template-1",
        },
      },
    });

    expect(route).toContain(APPLICATION_ROUTES.agreementSignature);
    expect(route).not.toContain(APPLICATION_ROUTES.firmaSign);
  });

  it("routes Firma steps without a dedicated library applicant route to firma-sign", () => {
    const route = routeForApplicantStep({
      step_key: "safety_training_sign",
      step_type: "custom_question",
      metadata: {
        workflow_step_id: "safety-training",
        workflow_settings: {
          ...DEFAULT_STEP_SETTINGS,
          firmaRecruiterTemplateId: "recruiter-template-1",
        },
      },
    });

    expect(route).toContain(APPLICATION_ROUTES.eSignature);
    expect(route).not.toContain(APPLICATION_ROUTES.authorizationsDocuments);
  });

  it("resolves Firma step by step id when URL stepKey is a duplicate alias", () => {
    const step = findOnboardingStepForFirmaSession(
      [
        {
          id: "step-uuid-2",
          step_key: "authorizations",
          title: "Employee Agreement",
          description: null,
          step_type: "authorizations",
          sort_order: 40,
          is_required: true,
          is_enabled: true,
          metadata: {
            workflow_settings: {
              ...DEFAULT_STEP_SETTINGS,
              firmaRecruiterTemplateId: "recruiter-template-1",
            },
          },
        },
      ],
      { stepKey: "authorizations_2", stepId: "step-uuid-2" }
    );

    expect(step?.id).toBe("step-uuid-2");
    expect(step?.step_key).toBe("authorizations");
  });
});

describe("firma status mapping", () => {
  it("maps Firma statuses to onboarding progress states", () => {
    expect(mapFirmaStatusToOnboardingStatus("sent")).toBe("in_progress");
    expect(mapFirmaStatusToOnboardingStatus("viewed")).toBe("in_progress");
    expect(mapFirmaStatusToOnboardingStatus("signed")).toBe("completed");
    expect(mapFirmaStatusToOnboardingStatus("completed")).toBe("completed");
    expect(mapFirmaStatusToOnboardingStatus("expired")).toBe("failed");
  });

  it("normalizes non-string Firma status payloads", () => {
    expect(mapFirmaStatusToOnboardingStatus({ status: "sent" })).toBe("in_progress");
    expect(mapFirmaStatusToOnboardingStatus(null)).toBe("pending");
    expect(mapFirmaStatusToOnboardingStatus(undefined)).toBe("pending");
  });

  it("normalizes Firma status flag objects from the current API", () => {
    expect(normalizeFirmaSigningStatus({ sent: true, finished: false })).toBe("sent");
    expect(normalizeFirmaSigningStatus({ sent: true, finished: true })).toBe("completed");
    expect(mapFirmaStatusToOnboardingStatus({ sent: true, finished: true })).toBe("completed");
    expect(shouldCompleteOnboardingStepFromFirmaStatus({ sent: true, finished: true })).toBe(
      true
    );
  });

  it("prefers applicant recipient completion over in-progress request status", () => {
    const status = resolveFirmaSigningStatusFromSources({
      requestStatus: { sent: true, finished: false },
      recipient: { finished_date: "2026-06-30T12:00:00.000Z" },
    });
    expect(status).toBe("signed");
    expect(shouldCompleteOnboardingStepFromFirmaStatus(status)).toBe(true);
  });

  it("updates onboarding completion when Firma status becomes signed", async () => {
    expect(mapFirmaStatusToOnboardingStatus("signed")).toBe("completed");
    expect(shouldCompleteOnboardingStepFromFirmaStatus("signed")).toBe(true);
  });
});

describe("firma signing url helpers", () => {
  it("builds iframe URL from signing_request_user_id", () => {
    const url = resolveFirmaRecipientSigningUrl({ id: "recipient-1" });
    expect(url).toBe("https://app.firma.dev/signing/recipient-1");
  });

  it("prefers explicit signing_url from Firma recipient payload", () => {
    const url = resolveFirmaRecipientSigningUrl({
      id: "recipient-1",
      signing_url: "https://app.firma.dev/signing/custom",
    });
    expect(url).toBe("https://app.firma.dev/signing/custom");
  });

  it("selects applicant recipient by email", () => {
    const recipient = resolveApplicantSigningRecipient(
      {
        id: "req-1",
        recipients: [
          { id: "r-1", email: "other@example.com" },
          { id: "r-2", email: "applicant@example.com" },
        ],
      },
      "applicant@example.com"
    );
    expect(recipient?.id).toBe("r-2");
  });

  it("selects applicant recipient from users when GET detail omits recipients", () => {
    const recipient = resolveApplicantSigningRecipient(
      { id: "req-1" },
      "applicant@example.com",
      [{ id: "r-2", email: "applicant@example.com" }]
    );
    expect(recipient?.id).toBe("r-2");
  });

  it("falls back to stored signing_request_user_id for iframe URL", () => {
    const url = resolveFirmaSigningIframeUrl(null, "stored-recipient-id");
    expect(url).toBe("https://app.firma.dev/signing/stored-recipient-id");
  });
});

describe("ensureFirmaSigningSession", () => {
  const originalKey = process.env.FIRMA_API_KEY;
  const originalWorkspace = process.env.FIRMA_WORKSPACE_ID;
  const workspaceId = "ws-tenant-a";

  function tenantSupabaseTable(table: string, options: { existingSession?: unknown } = {}) {
    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { firma_workspace_id: null },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "recruiter_templates") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "recruiter-template-1",
                  tenant_id: "tenant-1",
                  name: "Employee Agreement",
                  status: "active",
                  firma_template_id: "firma-template-1",
                  firma_workspace_id: workspaceId,
                },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "worker_firma_signing_sessions") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: options.existingSession ?? null, error: null }),
            }),
          }),
        }),
        upsert: () => ({
          select: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "session-1",
                tenant_id: "tenant-1",
                worker_id: "worker-1",
                onboarding_step_id: "step-1",
                recruiter_template_id: "recruiter-template-1",
                firma_template_id: "firma-template-1",
                firma_workspace_id: workspaceId,
                signing_request_id: "signing-request-1",
                signing_request_user_id: "recipient-1",
                firma_status: "sent",
                iframe_url: "https://app.firma.dev/signing/recipient-1",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
        delete: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  }

  beforeEach(() => {
    mockEnsureRecruiterTemplateForApplicantSigning.mockReset();
    mockEnsureRecruiterTemplateForApplicantSigning.mockResolvedValue(undefined);
    process.env.FIRMA_API_KEY = "firma_test_key";
    process.env.FIRMA_WORKSPACE_ID = workspaceId;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain(`workspace_id=${workspaceId}`);
        if (url.includes("/signing-requests/create-and-send")) {
          return new Response(
            JSON.stringify({
              id: "signing-request-1",
              status: "sent",
              recipients: [
                {
                  id: "recipient-1",
                  email: "applicant@example.com",
                  signing_url: "https://app.firma.dev/signing/recipient-1",
                },
              ],
            }),
            { status: 201 }
          );
        }
        if (url.includes("/signing-requests/signing-request-1")) {
          return new Response(
            JSON.stringify({
              id: "signing-request-1",
              status: "signed",
              recipients: [
                {
                  id: "recipient-1",
                  email: "applicant@example.com",
                  status: "signed",
                  signing_url: "https://app.firma.dev/signing/recipient-1",
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.includes("/templates/firma-template-1")) {
          return new Response(
            JSON.stringify({
              id: "firma-template-1",
              name: "Employee Agreement",
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      })
    );
  });

  afterEach(() => {
    process.env.FIRMA_API_KEY = originalKey;
    process.env.FIRMA_WORKSPACE_ID = originalWorkspace;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a Firma signing session when applicant reaches the step", async () => {
    const upsert = vi.fn().mockResolvedValue({
      data: {
        id: "session-1",
        tenant_id: "tenant-1",
        worker_id: "worker-1",
        onboarding_step_id: "step-1",
        recruiter_template_id: "recruiter-template-1",
        firma_template_id: "firma-template-1",
        firma_workspace_id: workspaceId,
        signing_request_id: "signing-request-1",
        signing_request_user_id: "recipient-1",
        firma_status: "sent",
        iframe_url: "https://app.firma.dev/signing/recipient-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    });

    const supabase = {
      from: vi.fn((table: string) => {
        const base = tenantSupabaseTable(table);
        if (table === "worker_firma_signing_sessions") {
          return {
            ...base,
            upsert: () => ({
              select: () => ({
                maybeSingle: upsert,
              }),
            }),
          };
        }
        return base;
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      applicantLastName: "Doe",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(session.signing_request_id).toBe("signing-request-1");
    expect(session.iframe_url).toBe("https://app.firma.dev/signing/recipient-1");
    expect(upsert).toHaveBeenCalled();
  });

  it("refreshes an existing session when Firma GET omits recipients", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/signing-requests/signing-request-1/users")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "recipient-1",
                email: "applicant@example.com",
                status: "sent",
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/signing-requests/signing-request-1")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-1",
            status: "sent",
          }),
          { status: 200 }
        );
      }
      if (url.includes("/templates/firma-template-1")) {
        return new Response(
          JSON.stringify({
            id: "firma-template-1",
            name: "Employee Agreement",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }) as typeof fetch;

    const upsert = vi.fn().mockResolvedValue({
      data: {
        id: "session-1",
        tenant_id: "tenant-1",
        worker_id: "worker-1",
        onboarding_step_id: "step-1",
        recruiter_template_id: "recruiter-template-1",
        firma_template_id: "firma-template-1",
        signing_request_id: "signing-request-1",
        signing_request_user_id: "recipient-1",
        firma_status: "sent",
        iframe_url: "https://app.firma.dev/signing/recipient-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants") {
          return tenantSupabaseTable(table);
        }
        if (table === "recruiter_templates") {
          return tenantSupabaseTable(table);
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "session-1",
                      tenant_id: "tenant-1",
                      worker_id: "worker-1",
                      onboarding_step_id: "step-1",
                      recruiter_template_id: "recruiter-template-1",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: workspaceId,
                      signing_request_id: "signing-request-1",
                      signing_request_user_id: "recipient-1",
                      firma_status: "sent",
                      iframe_url: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: () => ({
              select: () => ({
                maybeSingle: upsert,
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      applicantLastName: "Doe",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(session.iframe_url).toBe("https://app.firma.dev/signing/recipient-1");
    expect(upsert).toHaveBeenCalled();
  });

  it("refreshes an existing session using stored signing_request_user_id when users are unavailable", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/signing-requests/signing-request-1/users")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.includes("/signing-requests/signing-request-1")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-1",
            status: "sent",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }) as typeof fetch;

    const upsert = vi.fn().mockResolvedValue({
      data: {
        id: "session-1",
        tenant_id: "tenant-1",
        worker_id: "worker-1",
        onboarding_step_id: "step-1",
        recruiter_template_id: "recruiter-template-1",
        firma_template_id: "firma-template-1",
        signing_request_id: "signing-request-1",
        signing_request_user_id: "stored-recipient-id",
        firma_status: "sent",
        iframe_url: "https://app.firma.dev/signing/stored-recipient-id",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants" || table === "recruiter_templates") {
          return tenantSupabaseTable(table);
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "session-1",
                      tenant_id: "tenant-1",
                      worker_id: "worker-1",
                      onboarding_step_id: "step-1",
                      recruiter_template_id: "recruiter-template-1",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: workspaceId,
                      signing_request_id: "signing-request-1",
                      signing_request_user_id: "stored-recipient-id",
                      firma_status: "sent",
                      iframe_url: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: () => ({
              select: () => ({
                maybeSingle: upsert,
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(session.iframe_url).toBe("https://app.firma.dev/signing/stored-recipient-id");
  });

  it("recreates a stale session from another Firma workspace", async () => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const upsert = vi.fn().mockResolvedValue({
      data: {
        id: "session-2",
        tenant_id: "tenant-1",
        worker_id: "worker-1",
        onboarding_step_id: "step-1",
        recruiter_template_id: "recruiter-template-1",
        firma_template_id: "firma-template-1",
        firma_workspace_id: workspaceId,
        signing_request_id: "signing-request-1",
        signing_request_user_id: "recipient-1",
        firma_status: "sent",
        iframe_url: "https://app.firma.dev/signing/recipient-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants" || table === "recruiter_templates") {
          return tenantSupabaseTable(table);
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "session-1",
                      tenant_id: "tenant-1",
                      worker_id: "worker-1",
                      onboarding_step_id: "step-1",
                      recruiter_template_id: "recruiter-template-1",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: "ws-other-tenant",
                      signing_request_id: "signing-request-old",
                      signing_request_user_id: "recipient-old",
                      firma_status: "sent",
                      iframe_url: "https://app.firma.dev/signing/recipient-old",
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: () => ({ eq: deleteMock }),
            upsert: () => ({
              select: () => ({
                maybeSingle: upsert,
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(deleteMock).toHaveBeenCalled();
    expect(session.signing_request_id).toBe("signing-request-1");
    expect(upsert).toHaveBeenCalled();
  });

  it("creates an ephemeral Firma session for builder draft preview", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/templates/firma-template-1")) {
        return new Response(JSON.stringify({ id: "firma-template-1", name: "Employee Agreement" }), {
          status: 200,
        });
      }
      if (url.includes("/signing-requests/create-and-send")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-preview",
            status: "sent",
            recipients: [
              {
                id: "recipient-preview",
                email: "carl@taxequitypros.com",
                signing_url: "https://app.firma.dev/signing/recipient-preview",
              },
            ],
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }) as typeof fetch;

    const supabase = {
      from: vi.fn((table: string) => tenantSupabaseTable(table)),
    };

    const session = await ensureFirmaDraftPreviewSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      step: {
        id: "preview-authorizations_4",
        step_key: "authorizations_4",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(session.signing_request_id).toBe("signing-request-preview");
    expect(session.iframe_url).toContain("recipient-preview");

    const createCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
      String(url).includes("/signing-requests/create-and-send")
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse(String((createCall![1] as RequestInit).body));
    expect(body.recipients[0].email).toBe("carl@taxequitypros.com");
  });

  it("retries draft preview signing with fallback email when Firma reports a bounce", async () => {
    let createAttempts = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/templates/firma-template-1")) {
        return new Response(JSON.stringify({ id: "firma-template-1", name: "Employee Agreement" }), {
          status: 200,
        });
      }
      if (url.includes("/signing-requests/create-and-send")) {
        createAttempts += 1;
        const body = JSON.parse(String(init?.body));
        if (body.recipients[0].email === "preview@example.com") {
          return new Response(
            JSON.stringify({
              error: "preview@example.com can't receive email (the address bounced)",
            }),
            { status: 400 }
          );
        }
        return new Response(
          JSON.stringify({
            id: "signing-request-preview-retry",
            status: "sent",
            recipients: [
              {
                id: "recipient-preview-retry",
                email: "carl@taxequitypros.com",
                signing_url: "https://app.firma.dev/signing/recipient-preview-retry",
              },
            ],
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }) as typeof fetch;

    const supabase = {
      from: vi.fn((table: string) => tenantSupabaseTable(table)),
    };

    const session = await ensureFirmaDraftPreviewSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      applicantEmail: "preview@example.com",
      step: {
        id: "preview-authorizations_4",
        step_key: "authorizations_4",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(createAttempts).toBe(2);
    expect(session.signing_request_id).toBe("signing-request-preview-retry");
  });

  it("throws when no Firma workspace is configured", async () => {
    delete process.env.FIRMA_WORKSPACE_ID;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { firma_workspace_id: null }, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await expect(
      ensureFirmaSigningSession({
        supabase: supabase as never,
        tenantId: "tenant-1",
        workerId: "worker-1",
        applicantEmail: "applicant@example.com",
        applicantFirstName: "Jane",
        step: {
          id: "step-1",
          step_key: "employee_agreement",
          title: "Employee Agreement",
          description: null,
          step_type: "authorizations",
          sort_order: 10,
          is_required: true,
          is_enabled: true,
          metadata: {
            workflow_settings: {
              ...DEFAULT_STEP_SETTINGS,
              firmaRecruiterTemplateId: "recruiter-template-1",
            },
          },
        },
      })
    ).rejects.toMatchObject({ code: "WORKSPACE_NOT_CONFIGURED" });
  });

  it("throws when Firma template id is missing from step settings", async () => {
    await expect(
      ensureFirmaSigningSession({
        supabase: {
          from: vi.fn((table: string) => {
            if (table === "tenants") {
              return {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { firma_workspace_id: null },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            throw new Error(`Unexpected table ${table}`);
          }),
        } as never,
        tenantId: "tenant-1",
        workerId: "worker-1",
        applicantEmail: "applicant@example.com",
        applicantFirstName: "Jane",
        step: {
          id: "step-1",
          step_key: "employee_agreement",
          title: "Employee Agreement",
          description: null,
          step_type: "authorizations",
          sort_order: 10,
          is_required: true,
          is_enabled: true,
          metadata: { workflow_settings: DEFAULT_STEP_SETTINGS },
        },
      })
    ).rejects.toBeInstanceOf(FirmaOnboardingSigningError);
  });

  it("maps Firma workspace mismatch errors to a publish-again message", () => {
    const mapped = mapFirmaSigningCreateError(
      new FirmaOnboardingSigningError("ignored", "CREATE_FAILED")
    );
    expect(mapped.code).toBe("CREATE_FAILED");

    const workspace = mapFirmaSigningCreateError(
      Object.assign(new Error("Template does not belong to this workspace"), {
        name: "FirmaError",
      })
    );
    expect(workspace.code).toBe("TEMPLATE_WORKSPACE_MISMATCH");
    expect(workspace.message).toContain("Template Builder");
  });

  it("preserves Postgrest-style error messages that are not Error instances", () => {
    const mapped = mapFirmaSigningCreateError({
      code: "42P10",
      message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
    });
    expect(mapped.code).toBe("CREATE_FAILED");
    expect(mapped.message).toContain("ON CONFLICT");
  });

  it("uses tenant-specific workspace instead of global fallback", async () => {
    const tenantWorkspace = "workspace_tenant_specific";
    process.env.FIRMA_WORKSPACE_ID = "workspace_global";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain(`workspace_id=${tenantWorkspace}`);
      expect(url).not.toContain("workspace_id=workspace_global");
      if (url.includes("/signing-requests/create-and-send")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-tenant",
            status: "sent",
            recipients: [
              {
                id: "recipient-tenant",
                email: "applicant@example.com",
                signing_url: "https://app.firma.dev/signing/recipient-tenant",
              },
            ],
          }),
          { status: 201 }
        );
      }
      if (url.includes("/templates/firma-template-1")) {
        return new Response(JSON.stringify({ id: "firma-template-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { firma_workspace_id: tenantWorkspace },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "recruiter_templates") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "recruiter-template-1",
                      tenant_id: "tenant-1",
                      name: "Employee Agreement",
                      status: "active",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: tenantWorkspace,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            upsert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "session-tenant",
                    tenant_id: "tenant-1",
                    worker_id: "worker-1",
                    onboarding_step_id: "step-1",
                    recruiter_template_id: "recruiter-template-1",
                    firma_template_id: "firma-template-1",
                    firma_workspace_id: tenantWorkspace,
                    signing_request_id: "signing-request-tenant",
                    signing_request_user_id: "recipient-tenant",
                    firma_status: "sent",
                    iframe_url: "https://app.firma.dev/signing/recipient-tenant",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(session.signing_request_id).toBe("signing-request-tenant");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("auto-heals stale recruiter template workspace before signing", async () => {
    const tenantWorkspace = "workspace_current";
    let recruiterTemplateLoads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/signing-requests/create-and-send")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-healed",
            status: "sent",
            recipients: [
              {
                id: "recipient-healed",
                email: "applicant@example.com",
                signing_url: "https://app.firma.dev/signing/recipient-healed",
              },
            ],
          }),
          { status: 201 }
        );
      }
      if (url.includes("/templates/firma-template-healed")) {
        return new Response(JSON.stringify({ id: "firma-template-healed" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { firma_workspace_id: tenantWorkspace },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "recruiter_templates") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    recruiterTemplateLoads += 1;
                    if (recruiterTemplateLoads === 1) {
                      return {
                        data: {
                          id: "recruiter-template-1",
                          tenant_id: "tenant-1",
                          name: "Employee Agreement",
                          status: "active",
                          firma_template_id: "firma-template-1",
                          firma_workspace_id: "workspace_old",
                        },
                        error: null,
                      };
                    }
                    return {
                      data: {
                        id: "recruiter-template-1",
                        tenant_id: "tenant-1",
                        name: "Employee Agreement",
                        status: "active",
                        firma_template_id: "firma-template-healed",
                        firma_workspace_id: tenantWorkspace,
                      },
                      error: null,
                    };
                  },
                }),
              }),
            }),
          };
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            upsert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "session-healed",
                    tenant_id: "tenant-1",
                    worker_id: "worker-1",
                    onboarding_step_id: "step-1",
                    recruiter_template_id: "recruiter-template-1",
                    firma_template_id: "firma-template-healed",
                    firma_workspace_id: tenantWorkspace,
                    signing_request_id: "signing-request-healed",
                    signing_request_user_id: "recipient-healed",
                    firma_status: "sent",
                    iframe_url: "https://app.firma.dev/signing/recipient-healed",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(mockEnsureRecruiterTemplateForApplicantSigning).toHaveBeenCalledWith(
      supabase,
      "tenant-1",
      "recruiter-template-1",
      expect.objectContaining({ forceRecreate: true })
    );
    expect(session.signing_request_id).toBe("signing-request-healed");
  });

  it("creates signing session using global fallback when tenant workspace is null", async () => {
    process.env.FIRMA_WORKSPACE_ID = "workspace_global_test";
    const upsertPayload = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("workspace_id=workspace_global_test");
      if (url.includes("/signing-requests/create-and-send")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-fallback",
            status: "sent",
            recipients: [
              {
                id: "recipient-fallback",
                email: "applicant@example.com",
                signing_url: "https://app.firma.dev/signing/recipient-fallback",
              },
            ],
          }),
          { status: 201 }
        );
      }
      if (url.includes("/templates/firma-template-1")) {
        return new Response(JSON.stringify({ id: "firma-template-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { firma_workspace_id: null }, error: null }),
              }),
            }),
          };
        }
        if (table === "recruiter_templates") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "recruiter-template-1",
                      tenant_id: "tenant-1",
                      name: "Employee Agreement",
                      status: "active",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            upsert: (row: Record<string, unknown>) => {
              upsertPayload(row);
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "session-fallback",
                      ...row,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(session.signing_request_id).toBe("signing-request-fallback");
    expect(upsertPayload).toHaveBeenCalledWith(
      expect.objectContaining({ firma_workspace_id: "workspace_global_test" })
    );
  });

  it("reuses legacy signing sessions with null stored workspace when still valid", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/signing-requests/signing-request-legacy")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-legacy",
            status: "sent",
            recipients: [
              {
                id: "recipient-legacy",
                email: "applicant@example.com",
                signing_url: "https://app.firma.dev/signing/recipient-legacy",
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }) as typeof fetch;

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants" || table === "recruiter_templates") {
          return tenantSupabaseTable(table);
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "session-legacy",
                      tenant_id: "tenant-1",
                      worker_id: "worker-1",
                      onboarding_step_id: "step-1",
                      recruiter_template_id: "recruiter-template-1",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: null,
                      signing_request_id: "signing-request-legacy",
                      signing_request_user_id: "recipient-legacy",
                      firma_status: "sent",
                      iframe_url: "https://app.firma.dev/signing/recipient-legacy",
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "session-legacy",
                    tenant_id: "tenant-1",
                    worker_id: "worker-1",
                    onboarding_step_id: "step-1",
                    recruiter_template_id: "recruiter-template-1",
                    firma_template_id: "firma-template-1",
                    firma_workspace_id: workspaceId,
                    signing_request_id: "signing-request-legacy",
                    signing_request_user_id: "recipient-legacy",
                    firma_status: "sent",
                    iframe_url: "https://app.firma.dev/signing/recipient-legacy",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(session.iframe_url).toBe("https://app.firma.dev/signing/recipient-legacy");
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/signing-requests/create-and-send"),
      expect.anything()
    );
  });

  it.each([
    ["completed"],
    ["cancelled"],
    ["voided"],
    ["expired"],
    ["draft"],
  ])("recreates stale signing session when stored Firma status is %s", async (firmaStatus) => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const createFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/signing-requests/create-and-send")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-new",
            status: "sent",
            recipients: [
              {
                id: "recipient-new",
                email: "applicant@example.com",
                signing_url: "https://app.firma.dev/signing/recipient-new",
              },
            ],
          }),
          { status: 201 }
        );
      }
      if (url.includes("/templates/firma-template-1")) {
        return new Response(JSON.stringify({ id: "firma-template-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", createFetch);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants" || table === "recruiter_templates") {
          return tenantSupabaseTable(table);
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "session-stale",
                      tenant_id: "tenant-1",
                      worker_id: "worker-1",
                      onboarding_step_id: "step-1",
                      recruiter_template_id: "recruiter-template-1",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: workspaceId,
                      signing_request_id: "signing-request-old",
                      signing_request_user_id: "recipient-old",
                      firma_status: firmaStatus,
                      iframe_url: "https://app.firma.dev/signing/recipient-old",
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: () => ({ eq: deleteMock }),
            upsert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "session-new",
                    tenant_id: "tenant-1",
                    worker_id: "worker-1",
                    onboarding_step_id: "step-1",
                    recruiter_template_id: "recruiter-template-1",
                    firma_template_id: "firma-template-1",
                    firma_workspace_id: workspaceId,
                    signing_request_id: "signing-request-new",
                    signing_request_user_id: "recipient-new",
                    firma_status: "sent",
                    iframe_url: "https://app.firma.dev/signing/recipient-new",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(deleteMock).toHaveBeenCalled();
    expect(session.signing_request_id).toBe("signing-request-new");
    expect(createFetch).toHaveBeenCalledWith(
      expect.stringContaining("/signing-requests/create-and-send"),
      expect.anything()
    );
  });

  it("recreates session when Firma returns draft-only create-and-send response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/signing-requests/create-and-send")) {
          return new Response(
            JSON.stringify({
              id: "signing-request-draft",
              status: "draft",
              recipients: [{ id: "recipient-draft", email: "applicant@example.com" }],
            }),
            { status: 201 }
          );
        }
        if (url.includes("/templates/firma-template-1")) {
          return new Response(JSON.stringify({ id: "firma-template-1" }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      })
    );

    await expect(
      ensureFirmaSigningSession({
        supabase: {
          from: vi.fn((table: string) => tenantSupabaseTable(table)),
        } as never,
        tenantId: "tenant-1",
        workerId: "worker-1",
        applicantEmail: "applicant@example.com",
        applicantFirstName: "Jane",
        step: {
          id: "step-1",
          step_key: "employee_agreement",
          title: "Employee Agreement",
          description: null,
          step_type: "authorizations",
          sort_order: 10,
          is_required: true,
          is_enabled: true,
          metadata: {
            workflow_settings: {
              ...DEFAULT_STEP_SETTINGS,
              firmaRecruiterTemplateId: "recruiter-template-1",
            },
          },
        },
      })
    ).rejects.toMatchObject({ code: "SIGNING_REQUEST_DRAFT" });
  });

  it("recreates session when refresh cannot resolve iframe URL", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/signing-requests/signing-request-1/users")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      if (url.includes("/signing-requests/signing-request-1")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-1",
            status: "sent",
          }),
          { status: 200 }
        );
      }
      if (url.includes("/signing-requests/create-and-send")) {
        return new Response(
          JSON.stringify({
            id: "signing-request-new",
            status: "sent",
            recipients: [
              {
                id: "recipient-new",
                email: "applicant@example.com",
                signing_url: "https://app.firma.dev/signing/recipient-new",
              },
            ],
          }),
          { status: 201 }
        );
      }
      if (url.includes("/templates/firma-template-1")) {
        return new Response(JSON.stringify({ id: "firma-template-1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }) as typeof fetch;

    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tenants" || table === "recruiter_templates") {
          return tenantSupabaseTable(table);
        }
        if (table === "worker_firma_signing_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "session-1",
                      tenant_id: "tenant-1",
                      worker_id: "worker-1",
                      onboarding_step_id: "step-1",
                      recruiter_template_id: "recruiter-template-1",
                      firma_template_id: "firma-template-1",
                      firma_workspace_id: workspaceId,
                      signing_request_id: "signing-request-1",
                      signing_request_user_id: null,
                      firma_status: "sent",
                      iframe_url: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: () => ({ eq: deleteMock }),
            upsert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "session-new",
                    tenant_id: "tenant-1",
                    worker_id: "worker-1",
                    onboarding_step_id: "step-1",
                    recruiter_template_id: "recruiter-template-1",
                    firma_template_id: "firma-template-1",
                    firma_workspace_id: workspaceId,
                    signing_request_id: "signing-request-new",
                    signing_request_user_id: "recipient-new",
                    firma_status: "sent",
                    iframe_url: "https://app.firma.dev/signing/recipient-new",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const session = await ensureFirmaSigningSession({
      supabase: supabase as never,
      tenantId: "tenant-1",
      workerId: "worker-1",
      applicantEmail: "applicant@example.com",
      applicantFirstName: "Jane",
      step: {
        id: "step-1",
        step_key: "employee_agreement",
        title: "Employee Agreement",
        description: null,
        step_type: "authorizations",
        sort_order: 10,
        is_required: true,
        is_enabled: true,
        metadata: {
          workflow_settings: {
            ...DEFAULT_STEP_SETTINGS,
            firmaRecruiterTemplateId: "recruiter-template-1",
          },
        },
      },
    });

    expect(deleteMock).toHaveBeenCalled();
    expect(session.iframe_url).toBe("https://app.firma.dev/signing/recipient-new");
  });
});

describe("zoho separation", () => {
  it("does not reference Zoho routes for Firma-enabled authorizations steps", () => {
    const route = routeForApplicantStep({
      step_key: "welcome_packet",
      step_type: "authorizations",
      metadata: {
        workflow_step_id: "welcome-packet-esign",
        workflow_settings: {
          ...DEFAULT_STEP_SETTINGS,
          firmaRecruiterTemplateId: "recruiter-template-1",
        },
      },
    });

    expect(route).toContain("/application/agreement-signature");
    expect(route).not.toContain("zoho");
  });
});
