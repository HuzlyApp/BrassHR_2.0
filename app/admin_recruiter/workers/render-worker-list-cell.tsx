import type { ReactNode } from "react"
import Link from "next/link"
import { CandidateListAvatar } from "@/app/admin_recruiter/components/CandidateListAvatar"
import { CandidatePreHireIconLink } from "@/app/admin_recruiter/candidates/CandidatePreHireIconLink"
import { candidateMailHref } from "@/app/admin_recruiter/candidates/candidate-links"
import { candidateStatusBadgeClassName } from "@/app/admin_recruiter/candidates/candidate-status-badge"
import { adminWorkerProfileHref } from "./worker-profile-links"
import type { WorkerColumnId } from "./worker-columns"

export type WorkerListRow = {
  id: string
  profileId: string
  name: string
  email: string
  role: string
  location: string
  status: string
  createdAt: string | null
  profilePhotoUrl: string | null
  phone: string
  workerType: string
  employmentType: string
  reference: string
}

const LINK_CLASS =
  "truncate text-left transition hover:text-[color:var(--brand-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]"

export function renderWorkerListCell(
  col: WorkerColumnId,
  w: WorkerListRow,
  formatDate: (iso: string | null) => string
): ReactNode {
  switch (col) {
    case "name":
      return (
        <div className="flex w-full min-w-0 items-center gap-3">
          <CandidateListAvatar name={w.name || "NA"} photoUrl={w.profilePhotoUrl} />
          <div className="min-w-0 flex-1">
            <Link
              href={adminWorkerProfileHref(w.profileId)}
              className={`block text-sm font-medium text-black ${LINK_CLASS}`}
            >
              {w.name}
            </Link>
            {w.email ? (
              <Link
                href={candidateMailHref(w.profileId)}
                target="_blank"
                rel="noopener noreferrer"
                className={`block text-xs text-[#4B5563] ${LINK_CLASS}`}
              >
                {w.email}
              </Link>
            ) : (
              <div className="truncate text-xs text-[#4B5563]">—</div>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <CandidatePreHireIconLink
              workerId={w.profileId}
              candidateName={w.name}
              tab="post_hire"
            />
          </div>
        </div>
      )
    case "jobRole":
      return <span className="text-sm text-[#374151]">{w.role || "—"}</span>
    case "location":
      return <span className="text-sm text-[#374151]">{w.location || "—"}</span>
    case "status":
      return (
        <span
          className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold ${candidateStatusBadgeClassName(w.status)}`}
        >
          {w.status}
        </span>
      )
    case "email":
      return w.email ? (
        <Link
          href={candidateMailHref(w.profileId)}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm text-[#4B5563] ${LINK_CLASS}`}
        >
          {w.email}
        </Link>
      ) : (
        <span className="text-sm text-[#4B5563]">—</span>
      )
    case "phone":
      return <span className="text-sm text-[#4B5563]">{w.phone || "—"}</span>
    case "workerType":
      return <span className="text-sm text-[#4B5563]">{w.workerType || "—"}</span>
    case "employmentType":
      return <span className="text-sm text-[#4B5563]">{w.employmentType || "—"}</span>
    case "reference":
      return <span className="text-sm text-[#374151]">{w.reference || "—"}</span>
    case "createdDate":
      return <span className="text-sm text-[#374151]">{formatDate(w.createdAt)}</span>
    case "profile":
      return (
        <Link
          href={adminWorkerProfileHref(w.profileId)}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-[8px] border border-[color:var(--brand-primary)] px-4 py-2 text-xs font-semibold leading-4 text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)]"
        >
          Details
        </Link>
      )
    default:
      return <span className="text-sm text-[#4B5563]">—</span>
  }
}
