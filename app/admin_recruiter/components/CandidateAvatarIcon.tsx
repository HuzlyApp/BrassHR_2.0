"use client";

import { User } from "lucide-react";

type CandidateAvatarIconProps = {
  className?: string;
  photoUrl?: string | null;
  name?: string;
};

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

/** Applicant avatar — photo when available, otherwise tenant accent icon. */
export default function CandidateAvatarIcon({
  className = "",
  photoUrl,
  name = "",
}: CandidateAvatarIconProps) {
  const trimmedPhoto = photoUrl?.trim();

  const sizeClass = className.trim() || "h-[60px] w-[60px]";

  if (trimmedPhoto) {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden rounded-full border border-[#D1D5DB] bg-white ${sizeClass}`}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={trimmedPhoto} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  const initials = nameInitials(name);
  if (name.trim() && initials !== "?") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[#D1D5DB] bg-white text-lg font-semibold ${sizeClass}`}
        style={{ color: "var(--brand-primary)" }}
        aria-hidden
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[#D1D5DB] bg-white p-[10px] ${sizeClass}`}
      aria-hidden
    >
      <User className="h-9 w-9" style={{ color: "var(--brand-primary)" }} strokeWidth={2} />
    </span>
  );
}
