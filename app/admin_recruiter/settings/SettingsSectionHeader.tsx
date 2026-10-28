import type { ReactNode } from "react";

type SettingsSectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export default function SettingsSectionHeader({
  title,
  description,
  actions,
}: SettingsSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-7 tracking-tight text-[#101828]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-[#6B7280]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
