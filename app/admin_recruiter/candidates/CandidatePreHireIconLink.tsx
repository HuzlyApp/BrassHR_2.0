"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { candidateHireJourneyHref } from "./candidate-links";

type CandidatePreHireIconLinkProps = {
  workerId: string | null | undefined;
  candidateName?: string;
  /** Opens hire journey on a specific tab (e.g. post_hire for workers). */
  tab?: "pre_hire" | "post_hire";
  className?: string;
};

export function CandidatePreHireIconLink({
  workerId,
  candidateName,
  tab,
  className = "inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_8%,white)]",
}: CandidatePreHireIconLinkProps) {
  const id = typeof workerId === "string" ? workerId.trim() : "";
  if (!id) return null;

  const label = candidateName?.trim()
    ? `Open hire journey for ${candidateName.trim()}`
    : "Open hire journey";

  return (
    <Link
      href={candidateHireJourneyHref(id, tab ? { tab } : undefined)}
      className={className}
      aria-label={label}
      title="Pre-Hire / Post-Hire"
      onClick={(event) => event.stopPropagation()}
    >
      <ClipboardList
        className="h-4 w-4"
        strokeWidth={2}
        style={{ color: "var(--brand-primary)" }}
        aria-hidden
      />
    </Link>
  );
}
