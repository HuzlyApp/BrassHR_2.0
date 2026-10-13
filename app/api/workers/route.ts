import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { loadStaffUsersByIds } from "@/lib/account/resolve-staff-users";
import { attachWorkerProfilePhotoUrls } from "@/lib/applicant-portal/worker-profile-photo";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveStaffTenantScope } from "@/lib/auth/staff-tenant-scope";
import type { WorkerApplicationStatusSummary } from "@/lib/jobs/application-statuses/attach-worker-application-status";
import { getApplicationAssigneeFallbackByWorker } from "@/lib/candidates/sync-recruiter-assignment";
import {
  listingCountsForAnalyzedApplication,
  loadRequirementOutcomeCountsByApplication,
} from "@/lib/jobs/match-analysis/load-requirement-outcome-counts";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-env";
import { queryInChunks } from "@/lib/supabase/chunked-in-query";
import { normalizeTenantEmail } from "@/lib/tenant/tenant-email-uniqueness";
import {
  candidatePhoneNameKey,
  collapseWorkersToCandidateProfiles,
  findIdentitySiblingWorkerIds,
} from "@/lib/workers/candidate-identity";
import { loadCandidateListApplicationBundle } from "@/lib/workers/candidate-list-application-bundle";
import {
  CandidateSearchUnavailableError,
  resolveCandidateIdPage,
} from "@/lib/workers/resolve-candidate-id-page";
import {
  candidateListRequiresServerSearch,
  parseCandidateListQueryParams,
} from "@/lib/workers/candidate-list-params";
import {
  isApprovedPendingConversion,
  shouldExcludeFromApprovedCandidates,
  shouldExcludeFromCandidateLists,
} from "@/lib/workers/candidate-conversion-filter";
import { ACTIVE_CANDIDATE_PIPELINE_STATUSES } from "@/lib/workers/candidate-status-label";
import { applyWorkerTenantEq } from "@/lib/workers/tenant-query";
import {
  joinApplicationJobTitles,
  mergeWorkerAppliedJobs,
  mergeWorkerJobAssigneeEntries,
  type WorkerAppliedJob,
  type WorkerJobAssigneeEntry,
} from "@/lib/workers/worker-application-job-titles";
import {
  pickWorkerJobMatchSummaryPreferringRequirementCounts,
  type WorkerJobMatchSummary,
} from "@/lib/workers/worker-job-match-summary";
import { statusOrFilter } from "@/lib/workers/workers-status-filter";
import type { WorkerStatus } from "@/lib/workers/workers-status-types";

type SbErr = { message: string; code?: string };
type ContactLookupRow = {
  id: string | null;
  email: string | null;
  phone: string | null;
};

function parseStatus(v: string | null): WorkerStatus | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (
    s === "new" ||
    s === "pending" ||
    s === "for_approval" ||
    s === "approved" ||
    s === "disapproved" ||
    s === "active" ||
    s === "inactive" ||
    s === "cancelled" ||
    s === "banned"
  ) {
    return s;
  }
  return null;
}

const PIPELINE_STATUSES = new Set<WorkerStatus>([
  "new",
  "pending",
  "for_approval",
  "approved",
  "disapproved",
]);

/** Recruiter pipeline stages stored only in text `status` — not the legacy enum. */
const PIPELINE_TEXT_ONLY = new Set<WorkerStatus>([
  "pending",
  "for_approval",
  "approved",
  "disapproved",
]);

/** Legacy employment labels stored in text `status` — not recruiter pipeline stages. */
const EMPLOYMENT_ONLY_STATUSES = new Set<WorkerStatus>([
  "active",
  "inactive",
  "cancelled",
  "banned",
]);

function statusQueryAttempts(
  status: WorkerStatus | null,
  pipelineStatus: boolean,
  pipelineSelectExtra: string
): Array<{ col: "status" | "worker_status"; extra: string }> {
  if (pipelineStatus) {
    if (status && PIPELINE_TEXT_ONLY.has(status)) {
      return [{ col: "status", extra: pipelineSelectExtra }];
    }
    return [
      { col: "status", extra: pipelineSelectExtra },
      { col: "worker_status", extra: pipelineSelectExtra },
    ];
  }
  if (status && EMPLOYMENT_ONLY_STATUSES.has(status)) {
    return [
      { col: "worker_status", extra: pipelineSelectExtra },
      { col: "status", extra: pipelineSelectExtra },
    ];
  }
  return [
    { col: "status", extra: pipelineSelectExtra },
    { col: "worker_status", extra: "worker_status" },
  ];
}

/** Prefer text `status` (recruiter pipeline); fall back to enum `worker_status`. */
function resolveWorkerDisplayStatus(row: Record<string, unknown>): string | null {
  const pipeline =
    typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  const legacy =
    typeof row.worker_status === "string"
      ? row.worker_status.trim().toLowerCase()
      : "";

  if (pipeline) {
    if (PIPELINE_STATUSES.has(pipeline as WorkerStatus)) return pipeline;
    if (!EMPLOYMENT_ONLY_STATUSES.has(pipeline as WorkerStatus)) return pipeline;
  }

  if (legacy && PIPELINE_STATUSES.has(legacy as WorkerStatus)) return legacy;
  if (pipeline) return pipeline;
  if (legacy) return legacy;
  return null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireStaffApiSession();
    if (auth instanceof NextResponse) return auth;
    const tenantScope = await resolveStaffTenantScope(auth.authUser);

    const urlObj = new URL(req.url);
    const listParams = parseCandidateListQueryParams(urlObj.searchParams);
    const status = listParams.status ?? parseStatus(
      urlObj.searchParams.get("worker_status") ??
        urlObj.searchParams.get("status")
    );
    const headOnly = listParams.headOnly;
    const includePhotoUrls = listParams.includePhotoUrls;
    const conversionFilter = listParams.conversion;
    const { limit, offset } = listParams;
    const needsConversionFilter =
      conversionFilter === "pending" ||
      status == null ||
      (status === "approved" && conversionFilter !== "all");
    const queryLimit = limit;
    const queryOffset = offset;
    const requestStarted = Date.now();
    const phases: Record<string, number> = {};
    const markPhase = (name: string, startedAt: number) => {
      phases[name] = Date.now() - startedAt;
    };

    const url = getSupabaseUrl();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const anonKey = getSupabaseAnonKey();
    /** Prefer service role; fall back to anon if missing or rejected (e.g. wrong key in .env). */
    const keys = [serviceKey, anonKey].filter(
      (k): k is string => Boolean(k)
    );

    if (!url || keys.length === 0) {
      return Response.json(
        { error: "Supabase is not configured" },
        { status: 503 }
      );
    }

    let lastMessage = "Failed to load workers";

    const isMissingColumnErr = (e: unknown) => {
      const err = e as { code?: string; message?: string } | null;
      if (!err) return false;
      // Postgres undefined_column
      if (err.code === "42703") return true;
      return typeof err.message === "string" && err.message.includes(" does not exist");
    };

    const isInvalidEnumErr = (e: unknown) => {
      const err = e as { code?: string; message?: string } | null;
      if (!err) return false;
      if (err.code === "22P02") return true;
      return (
        typeof err.message === "string" &&
        err.message.includes("invalid input value for enum")
      );
    };

    for (const key of keys) {
      const supabase = createClient(url, key);
      const baseColsOptions =
        tenantScope.mode === "scoped"
          ? ([
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, zip, created_at, tenant_id, profile_photo, assigned_recruiter_user_id",
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, zip, created_at, tenant_id, profile_photo",
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, zip, created_at, tenant_id",
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, created_at, tenant_id",
            ] as const)
          : ([
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, zip, created_at, profile_photo, assigned_recruiter_user_id",
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, zip, created_at, profile_photo",
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, zip, created_at",
              "id, user_id, first_name, last_name, job_role, email, phone, address1, city, state, created_at",
            ] as const);

      // Applicant pipeline statuses live in text column `status`. Some databases also have an
      // unrelated enum `worker_status`, which does not accept values like "approved".
      const pipelineStatus =
        status === "new" ||
        status === "pending" ||
        status === "for_approval" ||
        status === "approved" ||
        status === "disapproved";
      const pipelineSelectExtra = "status, worker_status";
      const attempts = statusQueryAttempts(status, pipelineStatus, pipelineSelectExtra);

      let data: unknown[] | null = null;
      let error: SbErr | null = null;
      let count: number | null = null;
      let usedServerPage = false;

      const tenantIdForRpc =
        tenantScope.mode === "scoped" ? tenantScope.tenantId : null;
      const requiresServerSearch = candidateListRequiresServerSearch({
        ...listParams,
        status,
        excludeConverted: needsConversionFilter,
      });

      // Prefer server-side ID page (filters/search/sort + conversion exclusion before LIMIT).
      // Never fall back to an unfiltered page while search/filters are active.
      if (tenantIdForRpc || requiresServerSearch) {
        try {
          const idPageStarted = Date.now();
          const idPage = await resolveCandidateIdPage(supabase, tenantIdForRpc, {
            ...listParams,
            status,
            excludeConverted: needsConversionFilter,
          });
          markPhase("idPageMs", idPageStarted);
          // resolveCandidateIdPage already returns unique candidate-profile IDs + total.
          usedServerPage = true;
          count = idPage.total;
          if (headOnly) {
            data = [];
          } else if (idPage.ids.length === 0) {
            data = [];
          } else {
            const hydrateStarted = Date.now();
            let hydrateAttempts = 0;
            outerRpc: for (const baseCols of baseColsOptions) {
              for (const a of attempts) {
                hydrateAttempts += 1;
                const select = `${baseCols}, ${a.extra}`;
                const res = await supabase
                  .from("worker")
                  .select(select)
                  .in("id", idPage.ids);
                data = (res.data as unknown[] | null) ?? null;
                error = res.error
                  ? { message: res.error.message, code: (res.error as { code?: string }).code }
                  : null;
                if (!error) {
                  const byId = new Map(
                    ((data as Record<string, unknown>[]) ?? []).map((row) => [
                      String(row.id ?? ""),
                      row,
                    ])
                  );
                  data = idPage.ids
                    .map((id) => byId.get(id))
                    .filter((row): row is Record<string, unknown> => Boolean(row));
                  break outerRpc;
                }
                if (!isMissingColumnErr(error) && !isInvalidEnumErr(error)) break outerRpc;
              }
            }
            markPhase("hydrateMs", hydrateStarted);
            phases.hydrateAttempts = hydrateAttempts;
          }
        } catch (rpcErr) {
          if (rpcErr instanceof CandidateSearchUnavailableError || requiresServerSearch) {
            const message =
              rpcErr instanceof Error
                ? rpcErr.message
                : "Candidate search is temporarily unavailable.";
            return Response.json({ error: message }, { status: 503 });
          }
          console.warn("[api/workers] server page resolve failed, using legacy path", rpcErr);
          usedServerPage = false;
        }
      }

      if (!usedServerPage) {
        if (requiresServerSearch) {
          return Response.json(
            {
              error:
                "Candidate search requires server-side indexing. Please refresh and try again.",
            },
            { status: 503 }
          );
        }
        outer: for (const baseCols of baseColsOptions) {
          for (const a of attempts) {
            const select = `${baseCols}, ${a.extra}`;

            let q = supabase.from("worker").select(select, { count: "exact", head: headOnly });
            q = applyWorkerTenantEq(q, tenantScope) as typeof q;
            if (status) {
              q = q.or(statusOrFilter(a.col, status)) as typeof q;
            } else if (a.col === "status") {
              // All candidates tab: active pipeline only (exclude converted workers).
              const active = ACTIVE_CANDIDATE_PIPELINE_STATUSES.join(",");
              q = q.or(`status.in.(${active}),status.is.null`) as typeof q;
            }
            q = q.order("created_at", { ascending: listParams.sortDir === "asc" }) as typeof q;
            if (!headOnly) {
              q = q.range(queryOffset, queryOffset + queryLimit - 1) as typeof q;
            }

            const res = await q;
            data = (res.data as unknown[] | null) ?? null;
            error = res.error
              ? { message: res.error.message, code: (res.error as { code?: string }).code }
              : null;
            count = typeof res.count === "number" ? res.count : null;

            if (!error) {
              const hasResults = headOnly
                ? (count ?? 0) > 0
                : ((data as unknown[] | null)?.length ?? 0) > 0;
              if (hasResults) break outer;
              if (status && PIPELINE_TEXT_ONLY.has(status)) break outer;
              continue;
            }
            if (!isMissingColumnErr(error) && !isInvalidEnumErr(error)) break outer;
          }
        }
      }

      if (!error) {
        let normalized: Record<string, unknown>[] = (data ?? []).map((row) => {
          const r = row as Record<string, unknown>;
          const s = resolveWorkerDisplayStatus(r);
          return { ...r, status: s };
        });

        const shouldFilterConversion = !headOnly && needsConversionFilter && !usedServerPage;

        if (shouldFilterConversion && normalized.length > 0) {
          const candidateIds = normalized
            .map((row) => (typeof row.id === "string" ? row.id : ""))
            .filter(Boolean);
          const { data: employmentRows, error: employmentErr } = await queryInChunks(
            candidateIds,
            async (chunk) => {
              const result = await supabase
                .from("workers")
                .select("candidate_id")
                .in("candidate_id", chunk);
              return {
                data: (result.data ?? []) as Array<{ candidate_id?: string }>,
                error: result.error,
              };
            }
          );
          if (employmentErr && !isMissingColumnErr(employmentErr)) {
            const sbEmploymentErr = employmentErr as SbErr;
            error = {
              message: sbEmploymentErr.message || "Supabase query failed",
              code: sbEmploymentErr.code,
            };
          } else {
            const convertedIds = new Set(
              ((employmentRows as { candidate_id?: string }[] | null) ?? [])
                .map((row) => String(row.candidate_id ?? ""))
                .filter(Boolean)
            );
            normalized = normalized.filter((row) => {
              const rowStatus = typeof row.status === "string" ? row.status : null;
              const rowId = typeof row.id === "string" ? row.id : "";
              const hasEmployment = convertedIds.has(rowId);
              if (conversionFilter === "pending") {
                return isApprovedPendingConversion(rowStatus, hasEmployment);
              }
              if (status == null) {
                return !shouldExcludeFromCandidateLists(rowStatus, hasEmployment);
              }
              return !shouldExcludeFromApprovedCandidates(rowStatus, hasEmployment);
            });
          }
        }

        const paged = normalized;
        let total = count ?? paged.length;
        let hasMore = !headOnly && queryOffset + paged.length < total;

        if (error) {
          const errMsg = error.message || "Supabase query failed";
          lastMessage = errMsg;
          console.error("Supabase error:", error);
          const retry = errMsg === "Invalid API key" && key === serviceKey && anonKey;
          if (!retry) {
            return Response.json({ error: errMsg }, { status: 500 });
          }
          continue;
        }

        const withContacts = async () => {
          if (headOnly) return [];
          const rows = paged as Array<Record<string, unknown>>;
          if (rows.length === 0) return [];

          const userIds = Array.from(
            new Set(
              rows
                .map((row) => (typeof row.user_id === "string" ? row.user_id : ""))
                .filter(Boolean)
            )
          );
          const workerIds = Array.from(
            new Set(
              rows
                .map((row) => (typeof row.id === "string" ? row.id : ""))
                .filter(Boolean)
            )
          );

          let usersById = new Map<string, ContactLookupRow>();
          let applicantsById = new Map<string, ContactLookupRow>();
          const [usersResult, applicantsResult] = await Promise.all([
            userIds.length > 0
              ? queryInChunks(userIds, async (chunk) => {
                  const result = await supabase
                    .from("users")
                    .select("id, email, phone")
                    .in("id", chunk);
                  return {
                    data: (result.data ?? []) as ContactLookupRow[],
                    error: result.error,
                  };
                })
              : Promise.resolve({ data: [] as ContactLookupRow[], error: null }),
            workerIds.length > 0
              ? queryInChunks(workerIds, async (chunk) => {
                  const result = await supabase
                    .from("applicants")
                    .select("id, email, phone")
                    .in("id", chunk);
                  return {
                    data: (result.data ?? []) as ContactLookupRow[],
                    error: result.error,
                  };
                })
              : Promise.resolve({ data: [] as ContactLookupRow[], error: null }),
          ]);
          if (usersResult.error) {
            console.warn("Failed to load users contact data:", usersResult.error);
          } else {
            usersById = new Map(
              usersResult.data.filter((u) => Boolean(u.id)).map((u) => [String(u.id), u])
            );
          }
          if (applicantsResult.error) {
            console.warn("Failed to load applicants contact data:", applicantsResult.error);
          } else {
            applicantsById = new Map(
              applicantsResult.data
                .filter((a) => Boolean(a.id))
                .map((a) => [String(a.id), a])
            );
          }

          return rows.map((row) => {
            const workerId = typeof row.id === "string" ? row.id : "";
            const userId = typeof row.user_id === "string" ? row.user_id : "";
            const userContact = userId ? usersById.get(userId) : undefined;
            const applicantContact = workerId ? applicantsById.get(workerId) : undefined;
            return {
              ...row,
              user_email: userContact?.email ?? null,
              user_phone: userContact?.phone ?? null,
              applicant_email: applicantContact?.email ?? null,
              applicant_phone: applicantContact?.phone ?? null,
            };
          });
        };

        const contactsStarted = Date.now();
        const siblingsStarted = Date.now();
        const pageRows = headOnly ? [] : (paged as Array<Record<string, unknown>>);
        const tenantIdForApps =
          tenantScope.mode === "scoped"
            ? tenantScope.tenantId
            : typeof pageRows[0]?.tenant_id === "string"
              ? String(pageRows[0].tenant_id)
              : null;
        const pageWorkerIds = pageRows
          .map((row) => (typeof row.id === "string" ? row.id : ""))
          .filter(Boolean);

        const [enriched, siblingIds] = await Promise.all([
          withContacts(),
          !headOnly && pageWorkerIds.length > 0
            ? findIdentitySiblingWorkerIds(
                supabase,
                tenantIdForApps,
                pageRows.map((row) => ({
                  id: typeof row.id === "string" ? row.id : null,
                  email: typeof row.email === "string" ? row.email : null,
                  phone: typeof row.phone === "string" ? row.phone : null,
                  first_name: typeof row.first_name === "string" ? row.first_name : null,
                  last_name: typeof row.last_name === "string" ? row.last_name : null,
                }))
              ).catch((siblingErr) => {
                console.warn("[api/workers] identity sibling expansion failed", siblingErr);
                return pageWorkerIds;
              })
            : Promise.resolve(pageWorkerIds),
        ]);
        markPhase("contactsMs", contactsStarted);
        markPhase("siblingsMs", siblingsStarted);

        let withPhotos: Record<string, unknown>[] = headOnly ? [] : enriched;
        const photosStarted = Date.now();
        const attachStarted = Date.now();
        const [photoRows, applicationBundle] = await Promise.all([
          !headOnly && includePhotoUrls
            ? attachWorkerProfilePhotoUrls(supabase, enriched as Record<string, unknown>[]).catch(
                (photoErr) => {
                  console.warn("[api/workers] failed to attach profile photo urls", photoErr);
                  return (enriched as Record<string, unknown>[]).map((row) => ({
                    ...row,
                    profile_photo_url: null,
                  }));
                }
              )
            : Promise.resolve(
                headOnly
                  ? []
                  : (enriched as Record<string, unknown>[]).map((row) => ({
                      ...row,
                      profile_photo_url:
                        typeof row.profile_photo === "string" &&
                        row.profile_photo.startsWith("http")
                          ? row.profile_photo
                          : null,
                    }))
              ),
          !headOnly && siblingIds.length > 0
            ? loadCandidateListApplicationBundle(supabase, {
                tenantId: tenantIdForApps,
                workerIds: siblingIds,
              })
            : Promise.resolve(null),
        ]);
        if (!headOnly && includePhotoUrls) markPhase("photosMs", photosStarted);
        markPhase("attachBundleMs", attachStarted);
        withPhotos = photoRows;

        let workersOut: Record<string, unknown>[] = headOnly ? [] : withPhotos;

        if (!headOnly && workersOut.length > 0 && applicationBundle) {
          try {
            const enrichStarted = Date.now();
            const workerIdsForApps = siblingIds;
            const {
              summaries,
              appliedJobCounts,
              matchBundle,
              appliedJobsByWorker,
              jobAssigneesByWorker,
            } = applicationBundle;
            const jobTitlesByWorker = new Map<string, string[]>(
              [...appliedJobsByWorker.entries()].map(([workerId, jobs]) => [
                workerId,
                jobs.map((job) => job.title).filter(Boolean),
              ])
            );
            let matchSummaries = matchBundle.summaries;

            const matchApplicationIds = [
              ...new Set(
                [
                  ...matchBundle.analyzedApplicationIds,
                  ...[...matchSummaries.values()]
                    .map((match) => match.applicationId?.trim())
                    .filter((id): id is string => Boolean(id)),
                ]
              ),
            ];
            let requirementCountsByApplication = new Map<
              string,
              { confirmed: number; verify: number; notMet: number }
            >();

            const workersMissingAssignee = workersOut
              .map((row) => {
                const id = typeof row.id === "string" ? row.id.trim() : "";
                const assigneeId =
                  typeof row.assigned_recruiter_user_id === "string"
                    ? row.assigned_recruiter_user_id.trim()
                    : "";
                return !assigneeId && id ? id : "";
              })
              .filter(Boolean);

            const postAttachStarted = Date.now();
            const [requirementCountsResult, siblingRowsResult, applicationAssigneeFallback] =
              await Promise.all([
                tenantIdForApps && matchApplicationIds.length > 0
                  ? loadRequirementOutcomeCountsByApplication(
                      supabase,
                      tenantIdForApps,
                      matchApplicationIds
                    ).catch((countsErr) => {
                      console.warn("[api/workers] failed to attach requirement counts", countsErr);
                      return null;
                    })
                  : Promise.resolve(null),
                workerIdsForApps.length > 0
                  ? queryInChunks(workerIdsForApps, async (chunk) => {
                      let query = supabase
                        .from("worker")
                        .select("id, email, phone, first_name, last_name")
                        .in("id", chunk);
                      if (tenantIdForApps) query = query.eq("tenant_id", tenantIdForApps);
                      const result = await query;
                      return {
                        data: (result.data ?? []) as Array<{
                          id?: string;
                          email?: string | null;
                          phone?: string | null;
                          first_name?: string | null;
                          last_name?: string | null;
                        }>,
                        error: result.error,
                      };
                    }).catch((rollupErr) => {
                      console.warn("[api/workers] identity job-title rollup failed", rollupErr);
                      return { data: [] as Array<{
                        id?: string;
                        email?: string | null;
                        phone?: string | null;
                        first_name?: string | null;
                        last_name?: string | null;
                      }>, error: null };
                    })
                  : Promise.resolve({ data: [] as Array<{
                      id?: string;
                      email?: string | null;
                      phone?: string | null;
                      first_name?: string | null;
                      last_name?: string | null;
                    }>, error: null }),
                tenantIdForApps && workersMissingAssignee.length > 0
                  ? getApplicationAssigneeFallbackByWorker(
                      supabase,
                      tenantIdForApps,
                      workersMissingAssignee
                    )
                  : Promise.resolve(new Map<string, string>()),
              ]);
            markPhase("postAttachParallelMs", postAttachStarted);

            if (requirementCountsResult) {
              requirementCountsByApplication = requirementCountsResult;
              markPhase("requirementCountsMs", postAttachStarted);
              const refined = new Map(matchSummaries);
              for (const [workerId, apps] of matchBundle.appsByWorker) {
                const next = pickWorkerJobMatchSummaryPreferringRequirementCounts(
                  apps,
                  requirementCountsByApplication
                );
                if (next) refined.set(workerId, next);
              }
              matchSummaries = refined;
            }

            // Roll up applied-job titles/counts/status/match across identity siblings (including off-page duplicates).
            const titlesByPhoneName = new Map<string, Set<string>>();
            const countsByPhoneName = new Map<string, number>();
            const titlesByEmail = new Map<string, Set<string>>();
            const countsByEmail = new Map<string, number>();
            const assigneesByPhoneName = new Map<string, WorkerJobAssigneeEntry[]>();
            const assigneesByEmail = new Map<string, WorkerJobAssigneeEntry[]>();
            const appliedJobsByPhoneName = new Map<string, WorkerAppliedJob[]>();
            const appliedJobsByEmail = new Map<string, WorkerAppliedJob[]>();
            const summaryByPhoneName = new Map<string, WorkerApplicationStatusSummary>();
            const summaryByEmail = new Map<string, WorkerApplicationStatusSummary>();
            const matchByPhoneName = new Map<string, WorkerJobMatchSummary>();
            const matchByEmail = new Map<string, WorkerJobMatchSummary>();
            if (!siblingRowsResult.error) {
              for (const row of siblingRowsResult.data) {
                  const id = String(row.id ?? "").trim();
                  if (!id) continue;
                  const phoneKey = candidatePhoneNameKey(row);
                  const emailNorm = normalizeTenantEmail(String(row.email ?? ""));
                  const addTitles = (target: Map<string, Set<string>>, key: string) => {
                    const titles = target.get(key) ?? new Set<string>();
                    for (const title of jobTitlesByWorker.get(id) ?? []) {
                      if (title.trim()) titles.add(title.trim());
                    }
                    target.set(key, titles);
                  };
                  const addCount = (target: Map<string, number>, key: string) => {
                    target.set(key, (target.get(key) ?? 0) + (appliedJobCounts.get(id) ?? 0));
                  };
                  const addAssignees = (
                    target: Map<string, WorkerJobAssigneeEntry[]>,
                    key: string
                  ) => {
                    target.set(
                      key,
                      mergeWorkerJobAssigneeEntries([
                        target.get(key),
                        jobAssigneesByWorker.get(id),
                      ])
                    );
                  };
                  const addAppliedJobs = (
                    target: Map<string, WorkerAppliedJob[]>,
                    key: string
                  ) => {
                    target.set(
                      key,
                      mergeWorkerAppliedJobs([target.get(key), appliedJobsByWorker.get(id)])
                    );
                  };
                  const preferSummary = (
                    target: Map<string, WorkerApplicationStatusSummary>,
                    key: string,
                    next: WorkerApplicationStatusSummary
                  ) => {
                    const prev = target.get(key);
                    if (!prev || (!prev.jobTitle && next.jobTitle)) {
                      target.set(key, next);
                    }
                  };
                  const preferMatch = (
                    target: Map<string, WorkerJobMatchSummary>,
                    key: string,
                    next: WorkerJobMatchSummary
                  ) => {
                    const prev = target.get(key);
                    const prevScore = prev?.score ?? -1;
                    const nextScore = next.score ?? -1;
                    if (!prev || nextScore > prevScore) {
                      target.set(key, next);
                    }
                  };
                  const summary = summaries.get(id);
                  const match = matchSummaries.get(id);
                  if (phoneKey) {
                    addTitles(titlesByPhoneName, phoneKey);
                    addCount(countsByPhoneName, phoneKey);
                    addAssignees(assigneesByPhoneName, phoneKey);
                    addAppliedJobs(appliedJobsByPhoneName, phoneKey);
                    if (summary) preferSummary(summaryByPhoneName, phoneKey, summary);
                    if (match) preferMatch(matchByPhoneName, phoneKey, match);
                  }
                  if (emailNorm) {
                    addTitles(titlesByEmail, emailNorm);
                    addCount(countsByEmail, emailNorm);
                    addAssignees(assigneesByEmail, emailNorm);
                    addAppliedJobs(appliedJobsByEmail, emailNorm);
                    if (summary) preferSummary(summaryByEmail, emailNorm, summary);
                    if (match) preferMatch(matchByEmail, emailNorm, match);
                  }
              }
            }

            const assigneeIds = [
              ...new Set(
                [
                  ...workersOut.map((row) => {
                    const id = typeof row.id === "string" ? row.id.trim() : "";
                    const direct =
                      typeof row.assigned_recruiter_user_id === "string"
                        ? row.assigned_recruiter_user_id.trim()
                        : "";
                    return direct || (id ? applicationAssigneeFallback.get(id) ?? "" : "");
                  }),
                  ...[...jobAssigneesByWorker.values()].flatMap((entries) =>
                    entries.map((entry) => entry.assignedRecruiterUserId?.trim() ?? "")
                  ),
                ].filter(Boolean)
              ),
            ];
            const assigneesStarted = Date.now();
            const assigneesById =
              tenantIdForApps && assigneeIds.length > 0
                ? await loadStaffUsersByIds(supabase, tenantIdForApps, assigneeIds)
                : new Map();
            markPhase("assigneesMs", assigneesStarted);
            const resolveJobAssignees = (
              entries: WorkerJobAssigneeEntry[] | undefined
            ): Array<{
              application_id: string;
              job_title: string;
              assigned_recruiter_user_id: string | null;
              assigned_recruiter_name: string | null;
            }> =>
              (entries ?? []).map((entry) => {
                const assigneeId = entry.assignedRecruiterUserId?.trim() || "";
                const assignee = assigneeId ? assigneesById.get(assigneeId) : undefined;
                return {
                  application_id: entry.applicationId,
                  job_title: entry.jobTitle,
                  assigned_recruiter_user_id: assigneeId || null,
                  assigned_recruiter_name: assignee?.name?.trim() || null,
                };
              });
            workersOut = workersOut.map((row) => {
              const id = typeof row.id === "string" ? row.id : "";
              const identityFields = {
                id,
                email: typeof row.email === "string" ? row.email : null,
                phone: typeof row.phone === "string" ? row.phone : null,
                first_name: typeof row.first_name === "string" ? row.first_name : null,
                last_name: typeof row.last_name === "string" ? row.last_name : null,
              };
              const phoneKey = candidatePhoneNameKey(identityFields);
              const emailNorm = normalizeTenantEmail(String(row.email ?? ""));
              const rolledTitleSet =
                (phoneKey ? titlesByPhoneName.get(phoneKey) : undefined) ??
                (emailNorm ? titlesByEmail.get(emailNorm) : undefined);
              const rolledCount =
                (phoneKey ? countsByPhoneName.get(phoneKey) : undefined) ??
                (emailNorm ? countsByEmail.get(emailNorm) : undefined);
              const appliedJobCount =
                rolledCount && rolledCount > 0
                  ? rolledCount
                  : id
                    ? appliedJobCounts.get(id) ?? 1
                    : 1;
              const summary =
                (id ? summaries.get(id) : undefined) ??
                (phoneKey ? summaryByPhoneName.get(phoneKey) : undefined) ??
                (emailNorm ? summaryByEmail.get(emailNorm) : undefined);
              const match =
                (id ? matchSummaries.get(id) : undefined) ??
                (phoneKey ? matchByPhoneName.get(phoneKey) : undefined) ??
                (emailNorm ? matchByEmail.get(emailNorm) : undefined);
              const jobTitles =
                rolledTitleSet && rolledTitleSet.size > 0
                  ? [...rolledTitleSet]
                  : id
                    ? jobTitlesByWorker.get(id)
                    : undefined;
              const applicationJobTitlesText = joinApplicationJobTitles(jobTitles);
              const primaryJobTitle =
                summary?.jobTitle?.trim() || jobTitles?.find((title) => title.trim()) || null;
              const resolvedSearchText = applicationJobTitlesText || undefined;
              const directAssigneeId =
                typeof row.assigned_recruiter_user_id === "string"
                  ? row.assigned_recruiter_user_id.trim()
                  : "";
              const assigneeId =
                directAssigneeId || (id ? applicationAssigneeFallback.get(id) ?? "" : "");
              const assignee = assigneeId ? assigneesById.get(assigneeId) : undefined;
              const rolledJobAssignees =
                (phoneKey ? assigneesByPhoneName.get(phoneKey) : undefined) ??
                (emailNorm ? assigneesByEmail.get(emailNorm) : undefined);
              const jobAssignees = resolveJobAssignees(
                rolledJobAssignees && rolledJobAssignees.length > 0
                  ? rolledJobAssignees
                  : id
                    ? jobAssigneesByWorker.get(id)
                    : undefined
              );
              const rolledAppliedJobs =
                (phoneKey ? appliedJobsByPhoneName.get(phoneKey) : undefined) ??
                (emailNorm ? appliedJobsByEmail.get(emailNorm) : undefined);
              const appliedJobs =
                rolledAppliedJobs && rolledAppliedJobs.length > 0
                  ? rolledAppliedJobs
                  : id
                    ? appliedJobsByWorker.get(id) ?? []
                    : [];
              return {
                ...row,
                ...(assigneeId && !directAssigneeId
                  ? { assigned_recruiter_user_id: assigneeId }
                  : {}),
                applied_job_count: appliedJobCount,
                ...(assignee
                  ? {
                      assigned_recruiter_name: assignee.name,
                      assigned_recruiter_photo_url: assignee.profilePhotoUrl,
                    }
                  : {}),
                ...(jobAssignees.length > 0
                  ? { application_job_assignees: jobAssignees }
                  : {}),
                ...(appliedJobs.length > 0
                  ? {
                      application_applied_jobs: appliedJobs.map((job) => ({
                        job_id: job.jobId,
                        title: job.title,
                      })),
                    }
                  : {}),
                ...(summary
                  ? {
                      application_id: summary.applicationId,
                      application_status_id: summary.statusId,
                      application_status_name: summary.statusName,
                      application_status_key: summary.systemKey,
                      application_status_ambiguous: summary.ambiguous,
                      application_job_title: primaryJobTitle,
                      application_client_name: summary.clientName,
                      application_source_job_id: summary.sourceJobId,
                      application_source_type: summary.sourceType,
                    }
                  : primaryJobTitle
                    ? { application_job_title: primaryJobTitle }
                    : {}),
                ...(applicationJobTitlesText
                  ? { application_job_titles_text: applicationJobTitlesText }
                  : {}),
                ...(resolvedSearchText ? { application_search_text: resolvedSearchText } : {}),
                ...(match
                  ? {
                      match_application_id: match.applicationId,
                      ai_match_status: match.status,
                      ai_match_score: match.score,
                      ai_match_category: match.category,
                      ai_match_display_category: match.displayCategory,
                      ai_match_stage: match.stage,
                      ai_requirement_counts: listingCountsForAnalyzedApplication(
                        requirementCountsByApplication,
                        match.applicationId,
                        match.status
                      ),
                    }
                  : {}),
              };
            });

            const beforeCollapse = workersOut.length;
            workersOut = collapseWorkersToCandidateProfiles(workersOut, {
              jobTitlesByWorker,
              appliedJobCounts,
            });
            // ID page already pages unique candidate profiles; keep collapse as a
            // safety net and align total if any on-page duplicates remain.
            const collapsedAway = beforeCollapse - workersOut.length;
            if (collapsedAway > 0) {
              total = Math.max(workersOut.length, total - collapsedAway);
              hasMore = !headOnly && queryOffset + workersOut.length < total;
            } else {
              hasMore = !headOnly && queryOffset + workersOut.length < total;
            }
            markPhase("enrichTotalMs", enrichStarted);
          } catch (attachErr) {
            console.warn("[api/workers] failed to attach application statuses", attachErr);
          }
        }

        return Response.json({
          total,
          limit,
          offset,
          hasMore,
          workers: workersOut,
          timingMs: Date.now() - requestStarted,
          serverPaged: usedServerPage,
          ...(process.env.PERF_LOG === "true" || process.env.NODE_ENV !== "production"
            ? { phases }
            : {}),
        });
      }

      const errMsg = error?.message || "Supabase query failed";
      lastMessage = errMsg;
      console.error("Supabase error:", error);
      const retry =
        errMsg === "Invalid API key" && key === serviceKey && anonKey;
      if (!retry) {
        return Response.json({ error: errMsg }, { status: 500 });
      }
    }

    return Response.json({ error: lastMessage }, { status: 500 });
  } catch (err: unknown) {
    console.error("API ERROR:", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}