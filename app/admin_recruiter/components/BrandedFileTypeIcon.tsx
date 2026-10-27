"use client";

import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";

type FileType = "jpeg" | "pdf" | "docx";

type BrandedFileTypeIconProps = {
  type: FileType;
  className?: string;
};

const ICON_SRC: Record<FileType, string> = {
  jpeg: "/icons/jpeg-icon.svg",
  pdf: "/icons/pdf-icon.svg",
  docx: "/icons/docx-icon.svg",
};

/** File type icon (JPEG / PDF / DOCX) tinted with tenant primary from effective-branding CSS vars. */
export default function BrandedFileTypeIcon({
  type,
  className = "h-6 w-6",
}: BrandedFileTypeIconProps) {
  return (
    <BrandedSvgIcon
      src={ICON_SRC[type]}
      className={className}
      color="var(--brand-primary)"
    />
  );
}
