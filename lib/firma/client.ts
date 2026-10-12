import "server-only";
import { FirmaError } from "@/lib/firma/errors";
import type {
  FirmaApiErrorBody,
  FirmaJwtTokenResponse,
  FirmaSigningRequest,
  FirmaSigningRequestRecipient,
  FirmaTemplate,
  FirmaTemplateField,
  FirmaTemplateSettings,
  FirmaTemplateUser,
  FirmaWorkspaceAppearanceSettings,
} from "@/lib/firma/types";

const DEFAULT_API_BASE = "https://api.firma.dev/functions/v1/signing-request-api";

export function getFirmaApiBaseUrl(): string {
  return (process.env.FIRMA_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

export function getFirmaEditorAppUrl(): string {
  return (process.env.FIRMA_EDITOR_APP_URL ?? "https://app.firma.dev").replace(/\/$/, "");
}

export function getFirmaEmbedScriptUrl(): string {
  return (
    process.env.FIRMA_EMBED_SCRIPT_URL ??
    "https://api.firma.dev/functions/v1/embed-proxy/template-editor.js"
  );
}

export function getFirmaWorkspaceId(): string | undefined {
  const id = process.env.FIRMA_WORKSPACE_ID?.trim();
  return id || undefined;
}

export function isFirmaConfigured(): boolean {
  return Boolean(process.env.FIRMA_API_KEY?.trim());
}

function getFirmaApiKey(): string {
  const key = process.env.FIRMA_API_KEY?.trim();
  if (!key) {
    throw new FirmaError("NOT_CONFIGURED", "Firma API is not configured (missing FIRMA_API_KEY)", 503);
  }
  return key;
}

function buildUrl(path: string, workspaceId?: string, includeWorkspaceScope = true): string {
  const base = getFirmaApiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalized}`);
  if (includeWorkspaceScope) {
    const ws = workspaceId ?? getFirmaWorkspaceId();
    if (ws) url.searchParams.set("workspace_id", ws);
  }
  return url.toString();
}

function isFirmaProxyEnvelope(
  value: unknown
): value is { statusCode: number; body: unknown; headers?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    "statusCode" in value &&
    "body" in value &&
    typeof (value as { statusCode: unknown }).statusCode === "number"
  );
}

function parseFirmaJsonBody(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw.trim()) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { message: raw };
  }
}

function throwFirmaHttpError(status: number, errBody: FirmaApiErrorBody): never {
  const message = errBody.message ?? errBody.error ?? `Firma API error (${status})`;

  if (status === 401 || status === 403) {
    throw new FirmaError("AUTH_ERROR", message, status, errBody.details);
  }
  if (status === 404) {
    throw new FirmaError("NOT_FOUND", message, status, errBody.details);
  }
  if (status === 400 || status === 422) {
    throw new FirmaError("VALIDATION_ERROR", message, status, errBody.details);
  }
  if (status === 429) {
    throw new FirmaError("RATE_LIMIT", message, status, errBody.details);
  }
  throw new FirmaError("API_ERROR", message, status, errBody.details);
}

async function parseFirmaResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }

  let status = res.status;

  if (isFirmaProxyEnvelope(body)) {
    status = body.statusCode;
    body = parseFirmaJsonBody(body.body);
  }

  if (status < 200 || status >= 300) {
    throwFirmaHttpError(status, (body ?? {}) as FirmaApiErrorBody);
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const errorMessage = typeof record.error === "string" ? record.error.trim() : "";
    if (errorMessage) {
      const errorCode = typeof record.code === "string" ? record.code : undefined;
      const mappedStatus =
        errorCode === "NOT_FOUND" || errorCode === "INVALID_TEMPLATE"
          ? 404
          : errorCode === "AUTH_ERROR"
            ? 401
            : 400;
      throwFirmaHttpError(mappedStatus, body as FirmaApiErrorBody);
    }
  }

  if (body && typeof body === "object" && "data" in (body as Record<string, unknown>)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

type FirmaRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  workspaceId?: string;
  retries?: number;
  /** When false, omit workspace_id query param (company/account-level endpoints such as POST /workspaces). */
  includeWorkspaceScope?: boolean;
  /**
   * Override Authorization for workspace-scoped endpoints (e.g. appearance settings).
   * Firma rejects company/other-workspace keys with 403 "Cannot access resources in other workspaces".
   */
  apiKey?: string;
};

async function firmaRequest<T>(path: string, options: FirmaRequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    body,
    workspaceId,
    retries = 1,
    includeWorkspaceScope = true,
    apiKey: apiKeyOverride,
  } = options;
  const apiKey = apiKeyOverride?.trim() || getFirmaApiKey();
  const url = buildUrl(path, workspaceId, includeWorkspaceScope);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      return await parseFirmaResponse<T>(res);
    } catch (err) {
      lastError = err;
      if (err instanceof FirmaError) {
        if (err.code === "RATE_LIMIT" && attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : "Network request failed";
  throw new FirmaError("NETWORK_ERROR", msg, 502, lastError);
}

export async function listFirmaTemplates(workspaceId: string): Promise<FirmaTemplate[]> {
  const result = await firmaRequest<FirmaTemplate[] | { templates?: FirmaTemplate[] }>("/templates", {
    workspaceId,
  });
  if (Array.isArray(result)) return result;
  return result.templates ?? [];
}

export async function getFirmaTemplate(id: string, workspaceId: string): Promise<FirmaTemplate> {
  return firmaRequest<FirmaTemplate>(`/templates/${id}`, { workspaceId });
}

export async function createFirmaTemplate(
  input: {
    name: string;
    document: string;
    description?: string;
    expiration_hours?: number;
    settings?: FirmaTemplateSettings;
  },
  workspaceId: string
): Promise<FirmaTemplate> {
  return firmaRequest<FirmaTemplate>("/templates", {
    method: "POST",
    body: input,
    workspaceId,
    retries: 0,
  });
}

export async function updateFirmaTemplate(
  id: string,
  input: {
    name?: string;
    description?: string;
    document?: string;
    expiration_hours?: number;
    settings?: FirmaTemplateSettings;
    user?: Record<string, unknown>;
    field?: Record<string, unknown>;
  },
  workspaceId: string
): Promise<FirmaTemplate> {
  return firmaRequest<FirmaTemplate>(`/templates/${id}`, {
    method: "PATCH",
    body: input,
    workspaceId,
    retries: 0,
  });
}

export async function replaceFirmaTemplateDocument(
  id: string,
  document: string,
  workspaceId: string
): Promise<FirmaTemplate> {
  return firmaRequest<FirmaTemplate>(`/templates/${id}/replace-document`, {
    method: "POST",
    body: { document },
    workspaceId,
    retries: 0,
  });
}

export async function deleteFirmaTemplate(id: string, workspaceId: string): Promise<void> {
  await firmaRequest<void>(`/templates/${id}`, { method: "DELETE", workspaceId, retries: 0 });
}

export async function duplicateFirmaTemplateToSigningRequest(
  id: string,
  workspaceId: string,
  name?: string
): Promise<FirmaSigningRequest> {
  return firmaRequest<FirmaSigningRequest>(`/templates/${id}/duplicate`, {
    method: "POST",
    body: name ? { name } : {},
    workspaceId,
    retries: 0,
  });
}

export async function listFirmaTemplateUsers(
  id: string,
  workspaceId: string
): Promise<FirmaTemplateUser[]> {
  const result = await firmaRequest<FirmaTemplateUser[] | { users?: FirmaTemplateUser[] }>(
    `/templates/${id}/users`,
    { workspaceId }
  );
  if (Array.isArray(result)) return result;
  return result.users ?? [];
}

export async function listFirmaTemplateFields(
  id: string,
  workspaceId: string
): Promise<FirmaTemplateField[]> {
  const result = await firmaRequest<FirmaTemplateField[] | { fields?: FirmaTemplateField[] }>(
    `/templates/${id}/fields`,
    { workspaceId }
  );
  if (Array.isArray(result)) return result;
  return result.fields ?? [];
}

export function normalizeFirmaTemplateJwt(value: unknown): string {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token) {
    throw new FirmaError("API_ERROR", "Firma JWT response did not include a token", 502);
  }

  const normalized = token.startsWith("Bearer ") ? token.slice(7).trim() : token;
  if (normalized.split(".").length !== 3) {
    throw new FirmaError("API_ERROR", "Firma JWT response had an invalid token format", 502);
  }

  return normalized;
}

export async function generateFirmaTemplateJwt(
  templateId: string,
  workspaceId: string
): Promise<FirmaJwtTokenResponse> {
  const response = await firmaRequest<FirmaJwtTokenResponse>("/generate-template-token", {
    method: "POST",
    body: { companies_workspaces_templates_id: templateId },
    workspaceId,
    retries: 1,
  });

  return {
    ...response,
    token: normalizeFirmaTemplateJwt(response.token),
  };
}

export type CreateFirmaSigningRequestInput = {
  template_id: string;
  name?: string;
  description?: string;
  recipients?: Array<Record<string, unknown>>;
};

export async function createFirmaSigningRequest(
  input: CreateFirmaSigningRequestInput,
  workspaceId: string
): Promise<FirmaSigningRequest> {
  return firmaRequest<FirmaSigningRequest>("/signing-requests", {
    method: "POST",
    body: input,
    workspaceId,
    retries: 0,
  });
}

/** Creates a signing request and sends it in one call (required for embedded signing URLs). */
export async function createAndSendFirmaSigningRequest(
  input: CreateFirmaSigningRequestInput,
  workspaceId: string
): Promise<FirmaSigningRequest> {
  try {
    return await firmaRequest<FirmaSigningRequest>("/signing-requests/create-and-send", {
      method: "POST",
      body: input,
      workspaceId,
      retries: 0,
    });
  } catch (err) {
    if (err instanceof FirmaError && err.code === "NOT_FOUND") {
      const draft = await createFirmaSigningRequest(input, workspaceId);
      return sendFirmaSigningRequest(draft.id, workspaceId);
    }
    throw err;
  }
}

export async function sendFirmaSigningRequest(
  signingRequestId: string,
  workspaceId: string
): Promise<FirmaSigningRequest> {
  return firmaRequest<FirmaSigningRequest>(`/signing-requests/${signingRequestId}/send`, {
    method: "POST",
    body: {},
    workspaceId,
    retries: 0,
  });
}

export async function getFirmaSigningRequest(
  id: string,
  workspaceId: string
): Promise<FirmaSigningRequest> {
  return firmaRequest<FirmaSigningRequest>(`/signing-requests/${id}`, { workspaceId, retries: 1 });
}

type FirmaSigningRequestUsersResponse =
  | FirmaSigningRequestRecipient[]
  | { items?: FirmaSigningRequestRecipient[] };

function normalizeFirmaSigningRequestUsers(
  response: FirmaSigningRequestUsersResponse
): FirmaSigningRequestRecipient[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.items)) return response.items;
  return [];
}

export async function getFirmaSigningRequestUsers(
  signingRequestId: string,
  workspaceId: string
): Promise<FirmaSigningRequestRecipient[]> {
  const response = await firmaRequest<FirmaSigningRequestUsersResponse>(
    `/signing-requests/${signingRequestId}/users`,
    { workspaceId, retries: 1 }
  );
  return normalizeFirmaSigningRequestUsers(response);
}

export type FirmaSigningRequestDownload = {
  status: string;
  is_partial?: boolean;
  download_url: string;
  generated_at?: string;
  expires_at?: string;
};

export async function getFirmaSigningRequestDownload(
  signingRequestId: string,
  workspaceId: string
): Promise<FirmaSigningRequestDownload> {
  return firmaRequest<FirmaSigningRequestDownload>(
    `/signing-requests/${signingRequestId}/download`,
    { workspaceId, retries: 1 }
  );
}

export async function tryGetFirmaSigningRequestDownload(
  signingRequestId: string,
  workspaceId: string
): Promise<string | null> {
  try {
    const res = await getFirmaSigningRequestDownload(signingRequestId, workspaceId);
    return res.download_url?.trim() || null;
  } catch (err) {
    console.warn("[firma] tryGetFirmaSigningRequestDownload failed:", err);
    return null;
  }
}

export type FirmaWorkspace = {
  id: string;
  name?: string;
};

/** Workspace detail including scoped keys — never persist api_key / test_api_key. */
export type FirmaWorkspaceDetail = FirmaWorkspace & {
  api_key?: string | null;
  test_api_key?: string | null;
  protected?: boolean | null;
};

type FirmaWorkspaceListResponse = {
  results?: FirmaWorkspaceDetail[];
  pagination?: {
    current_page?: number;
    page_size?: number;
    total_count?: number;
    total_pages?: number;
  };
};

/**
 * Resolve the live api_key for a workspace.
 * Firma returns scoped keys on GET /workspaces (list). GET /workspaces/{id} often
 * returns 403 for non-own keys, so branding sync must use the list endpoint.
 *
 * Cache hits and misses: listing every workspace on each applicant status poll
 * was taking 10s+ and then failing for workspaces the company key cannot see.
 */
const WORKSPACE_API_KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const WORKSPACE_API_KEY_MAX_PAGES = 8;
const workspaceApiKeyCache = new Map<string, { value: string | null; expiresAt: number }>();

export function clearFirmaWorkspaceApiKeyCache(): void {
  workspaceApiKeyCache.clear();
}

function readCachedWorkspaceApiKey(workspaceId: string): string | null | undefined {
  const hit = workspaceApiKeyCache.get(workspaceId);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    workspaceApiKeyCache.delete(workspaceId);
    return undefined;
  }
  return hit.value;
}

function writeCachedWorkspaceApiKey(workspaceId: string, value: string | null): void {
  workspaceApiKeyCache.set(workspaceId, {
    value,
    expiresAt: Date.now() + WORKSPACE_API_KEY_CACHE_TTL_MS,
  });
}

async function fetchFirmaWorkspaceListPage(
  page: number
): Promise<FirmaWorkspaceListResponse | FirmaWorkspaceDetail[]> {
  const path = page === 1 ? "/workspaces" : `/workspaces?page=${page}`;
  return firmaRequest<FirmaWorkspaceListResponse | FirmaWorkspaceDetail[]>(path, {
    includeWorkspaceScope: false,
    retries: 1,
  });
}

function rowsFromWorkspaceList(
  result: FirmaWorkspaceListResponse | FirmaWorkspaceDetail[]
): FirmaWorkspaceDetail[] {
  return Array.isArray(result) ? result : result.results ?? [];
}

/** Company-wide workspace list (no workspace_id query param). Does not persist API keys. */
export async function listFirmaWorkspaces(): Promise<FirmaWorkspaceDetail[]> {
  const workspaces: FirmaWorkspaceDetail[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= WORKSPACE_API_KEY_MAX_PAGES) {
    const result = await fetchFirmaWorkspaceListPage(page);
    workspaces.push(...rowsFromWorkspaceList(result));
    if (!Array.isArray(result) && result.pagination) {
      totalPages = Math.max(1, Number(result.pagination.total_pages) || 1);
    } else {
      break;
    }
    page += 1;
  }

  return workspaces;
}

export async function firmaWorkspaceExistsInCompany(workspaceId: string): Promise<boolean> {
  const target = workspaceId.trim();
  if (!target) return false;
  const workspaces = await listFirmaWorkspaces();
  return workspaces.some((row) => row.id?.trim() === target);
}

export async function resolveFirmaWorkspaceApiKey(workspaceId: string): Promise<string> {
  const target = workspaceId.trim();
  if (!target) {
    throw new FirmaError("VALIDATION_ERROR", "Firma workspace id is required", 400);
  }

  const cached = readCachedWorkspaceApiKey(target);
  if (cached) return cached;
  if (cached === null) {
    throw new FirmaError(
      "AUTH_ERROR",
      `Firma workspace api_key was not found for workspace ${target}; cannot update appearance settings`,
      403
    );
  }

  const workspaces = await listFirmaWorkspaces();
  const match = workspaces.find((row) => row.id?.trim() === target);
  const apiKey = match?.api_key?.trim();
  if (apiKey) {
    writeCachedWorkspaceApiKey(target, apiKey);
    return apiKey;
  }

  writeCachedWorkspaceApiKey(target, null);
  throw new FirmaError(
    "AUTH_ERROR",
    `Firma workspace api_key was not found for workspace ${target}; cannot update appearance settings`,
    403
  );
}

/** Official endpoint: POST /workspaces (docs.firma.dev/guides/creating-workspaces) */
export async function createFirmaWorkspace(input: {
  name: string;
  slug?: string | null;
}): Promise<FirmaWorkspace> {
  const name = input.name.trim();
  if (!name) {
    throw new FirmaError("VALIDATION_ERROR", "Firma workspace name is required", 400);
  }

  const result = await firmaRequest<FirmaWorkspace>("/workspaces", {
    method: "POST",
    body: { name },
    includeWorkspaceScope: false,
    retries: 0,
  });

  const id = typeof result?.id === "string" ? result.id.trim() : "";
  if (!id) {
    throw new FirmaError("API_ERROR", "Firma did not return a workspace id", 502);
  }

  return { id, name: result.name ?? name };
}

/**
 * Sync company-wide appearance defaults (app.firma.dev → Settings → Appearance).
 * Workspace settings override these per workspace; company primary must be BrassHR gold
 * so embedded editors inherit gold CTAs when workspace inherits from company.
 */
export async function updateFirmaCompanyAppearanceSettings(
  settings: FirmaWorkspaceAppearanceSettings
): Promise<FirmaWorkspaceAppearanceSettings> {
  return firmaRequest<FirmaWorkspaceAppearanceSettings>("/company/settings", {
    method: "PUT",
    body: settings,
    includeWorkspaceScope: false,
    retries: 1,
  });
}

/**
 * Sync workspace appearance (embedded editor + signing chrome).
 * Must authenticate with the target workspace's own api_key — company/other-workspace
 * keys return 403 for appearance settings even when template/signing ops work via workspace_id.
 */
export async function updateFirmaWorkspaceSettings(
  workspaceId: string,
  settings: FirmaWorkspaceAppearanceSettings
): Promise<FirmaWorkspaceAppearanceSettings> {
  const id = workspaceId.trim();
  if (!id) {
    throw new FirmaError("VALIDATION_ERROR", "Firma workspace id is required", 400);
  }

  const workspaceApiKey = await resolveFirmaWorkspaceApiKey(id);

  return firmaRequest<FirmaWorkspaceAppearanceSettings>(`/workspace/${id}/settings`, {
    method: "PUT",
    body: settings,
    includeWorkspaceScope: false,
    apiKey: workspaceApiKey,
    retries: 1,
  });
}

export type FirmaWorkspaceLogoUploadResult = {
  icon_url?: string | null;
};

/**
 * Upload workspace logo (POST /workspaces/{id}/logo).
 * Firma accepts PNG or JPEG up to 2MB; use the workspace api_key for auth.
 */
export async function uploadFirmaWorkspaceLogo(
  workspaceId: string,
  file: Buffer | Blob,
  filename: string,
  contentType: string
): Promise<FirmaWorkspaceLogoUploadResult> {
  const id = workspaceId.trim();
  if (!id) {
    throw new FirmaError("VALIDATION_ERROR", "Firma workspace id is required", 400);
  }

  const workspaceApiKey = await resolveFirmaWorkspaceApiKey(id);
  const url = buildUrl(`/workspaces/${id}/logo`, undefined, false);
  const mime = contentType.trim().toLowerCase();
  const blob =
    file instanceof Blob
      ? file
      : new Blob([new Uint8Array(file)], { type: mime });

  const form = new FormData();
  form.append("file", blob, filename);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: workspaceApiKey,
    },
    body: form,
    cache: "no-store",
  });

  return parseFirmaResponse<FirmaWorkspaceLogoUploadResult>(res);
}

export function resolveFirmaRecipientSigningUrl(
  recipient: FirmaSigningRequestRecipient | null | undefined
): string | null {
  if (!recipient) return null;
  const direct = recipient.signing_url?.trim() || recipient.signing_link?.trim();
  if (direct) return direct;
  const recipientId = recipient.id?.trim();
  if (!recipientId) return null;
  return `${getFirmaEditorAppUrl()}/signing/${recipientId}`;
}

export function resolveApplicantSigningRecipient(
  detail: FirmaSigningRequest,
  email: string,
  users?: FirmaSigningRequestRecipient[]
): FirmaSigningRequestRecipient | null {
  const normalized = email.trim().toLowerCase();
  const recipients =
    Array.isArray(detail.recipients) && detail.recipients.length > 0
      ? detail.recipients
      : Array.isArray(users) && users.length > 0
        ? users
        : [];
  const match = recipients.find(
    (recipient) => (recipient.email ?? "").trim().toLowerCase() === normalized
  );
  if (match) return match;
  if (detail.first_signer?.id) return detail.first_signer;
  return recipients[0] ?? null;
}

export function resolveFirmaSigningIframeUrl(
  recipient: FirmaSigningRequestRecipient | null | undefined,
  fallbackUserId?: string | null
): string | null {
  return (
    resolveFirmaRecipientSigningUrl(recipient) ??
    resolveFirmaRecipientSigningUrl(fallbackUserId?.trim() ? { id: fallbackUserId.trim() } : null)
  );
}
