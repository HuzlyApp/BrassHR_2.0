"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import CreateTemplateModal, {
  type CreateTemplatePayload,
} from "@/app/admin_recruiter/components/CreateTemplateModal";
import TemplateCreateSuccessModal from "@/app/admin_recruiter/components/TemplateCreateSuccessModal";
import CandidateDetailLoader from "@/app/admin_recruiter/components/CandidateDetailLoader";
import { staffAuthHeaders } from "@/lib/staff-auth-headers";
import { markPendingWorkflowPaste } from "@/lib/onboarding/workflow-template-pending-paste";

const PAGE_BG = "#f8f8f8";
const CARD_BORDER = "#eaecf0";
const TEXT_PRIMARY = "#101828";
const BUILDER_BASE = "/admin_recruiter/dashboard/onboarding-builder";
const BUILDER_QUERY_KEY = ["onboarding-builder", "effective-tenant"] as const;

type TemplateItem = {
  id: string;
  name: string;
  description?: string | null;
  isPreset?: boolean;
  isEditable?: boolean;
  status?: "draft" | "published" | "unpublished";
  employmentType?: "W2" | "1099" | "RNR" | null;
  preHireStepCount?: number;
  postHireStepCount?: number;
  transitionStepCount?: number;
  totalStepCount?: number;
};

function CreateTemplateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="6.75" stroke="white" strokeWidth="1.5" />
      <path d="M9 6.25V11.75M6.25 9H11.75" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TemplateActionButton({
  label,
  iconSrc,
  onClick,
  href,
  disabled = false,
}: {
  label: string;
  iconSrc: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const className =
    "inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)] disabled:cursor-not-allowed disabled:opacity-40";

  const icon = (
    <BrandedSvgIcon src={iconSrc} className="h-4 w-4" color="var(--brand-primary)" />
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={label} title={label}>
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function TemplateCard({
  item,
  canDelete,
  copying,
  onCopy,
  onView,
  onDelete,
}: {
  item: TemplateItem;
  canDelete: boolean;
  copying?: boolean;
  onCopy: (id: string) => void;
  onView: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const editHref = `${BUILDER_BASE}?template=${item.id}`;
  const displayName = item.name.replace(/\.tpl$/i, "");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <div
      className="group relative flex flex-col rounded-xl border bg-white p-3 transition-colors hover:border-[color:var(--brand-primary)] sm:p-4"
      style={{ borderColor: CARD_BORDER }}
    >
      <Link
        href={editHref}
        className="flex min-w-0 gap-3 pr-0 sm:pr-20"
        aria-label={`Edit ${displayName}`}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10"
          style={{ backgroundColor: "color-mix(in srgb, var(--brand-primary) 12%, white)" }}
        >
          <BrandedSvgIcon
            src="/icons/template-icon.svg"
            className="h-5 w-5 sm:h-6 sm:w-6"
            color="var(--brand-primary)"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="text-[13px] font-semibold leading-[18px] text-[#101828] break-words line-clamp-2 sm:text-sm sm:leading-5"
            style={{ color: TEXT_PRIMARY }}
          >
            {displayName}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-4 text-[#667085]">
            {item.status ? (
              <span className="capitalize">{item.status === "unpublished" ? "Draft" : item.status}</span>
            ) : null}
            {item.employmentType ? (
              <span>Employment Type: {item.employmentType}</span>
            ) : null}
            {typeof item.preHireStepCount === "number" ? (
              <span>Pre-Hire: {item.preHireStepCount}</span>
            ) : null}
            {typeof item.postHireStepCount === "number" ? (
              <span>Post-Hire: {item.postHireStepCount}</span>
            ) : null}
            {typeof item.totalStepCount === "number" ? (
              <span>Total: {item.totalStepCount}</span>
            ) : null}
          </div>
          {item.description ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-4 text-[#667085]">{item.description}</p>
          ) : null}
        </div>
      </Link>

      <div
        className="mt-3 flex items-center justify-end gap-1 border-t pt-2.5 opacity-100 transition-opacity sm:absolute sm:right-3 sm:top-3 sm:mt-0 sm:border-0 sm:pt-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        style={{ borderColor: CARD_BORDER }}
      >
        <TemplateActionButton
          label="Copy to workflow"
          iconSrc="/icons/template-icons/codicon_notebook-template.svg"
          onClick={() => onCopy(item.id)}
          disabled={copying}
        />
        <TemplateActionButton
          label="View workflow"
          iconSrc="/icons/template-icons/eye.svg"
          onClick={() => onView(item.id)}
        />
        <TemplateActionButton
          label="Edit template"
          iconSrc="/icons/template-icons/pencil.svg"
          href={editHref}
        />
        {canDelete ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)]"
              aria-label="More options"
              title="More options"
            >
              <BrandedSvgIcon
                src="/icons/template-icons/dots-vertical.svg"
                className="h-4 w-4"
                color="var(--brand-primary)"
              />
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border bg-white py-1 shadow-lg"
                style={{ borderColor: CARD_BORDER }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(item.id, displayName);
                  }}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminRecruiterTemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdTemplateName, setCreatedTemplateName] = useState("");
  const [createdTemplateId, setCreatedTemplateId] = useState<string | null>(null);
  const [presets, setPresets] = useState<TemplateItem[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/workflow-templates", {
        headers: await staffAuthHeaders(),
      });
      const data = (await res.json()) as {
        presets?: TemplateItem[];
        savedTemplates?: TemplateItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load templates");
      setPresets(data.presets ?? []);
      setSavedTemplates(data.savedTemplates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
      setPresets([]);
      setSavedTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleCopyToWorkflow = useCallback(
    async (templateId: string) => {
      if (copyingId) return;
      setCopyingId(templateId);
      try {
        const res = await fetch(`/api/admin/workflow-templates/${templateId}/copy-to-workflow`, {
          method: "POST",
          headers: await staffAuthHeaders(),
        });
        const data = (await res.json()) as {
          error?: string;
          templateName?: string;
          copiedTemplateId?: string | null;
          redirectTo?: string;
        };
        if (!res.ok) throw new Error(data.error || "Failed to copy template");

        const name = data.templateName?.replace(/\.tpl$/i, "") ?? "Template";
        markPendingWorkflowPaste(templateId);
        void queryClient.invalidateQueries({ queryKey: BUILDER_QUERY_KEY });
        toast.success(`"${name}" copied to a draft workflow.`);
        router.push(`${data.redirectTo ?? BUILDER_BASE}${data.copiedTemplateId ? `?template=${encodeURIComponent(data.copiedTemplateId)}` : ""}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to copy template");
      } finally {
        setCopyingId(null);
      }
    },
    [copyingId, queryClient, router]
  );

  const handleViewTemplate = useCallback(
    (templateId: string) => {
      router.push(`${BUILDER_BASE}?template=${templateId}&view=1`);
    },
    [router]
  );

  const handleDeleteTemplate = useCallback(
    async (templateId: string, displayName: string) => {
      const confirmed = window.confirm(`Delete "${displayName}"? This cannot be undone.`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/admin/workflow-templates/${templateId}`, {
          method: "DELETE",
          headers: await staffAuthHeaders(),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Failed to delete template");
        toast.success("Template deleted");
        await loadTemplates();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete template");
      }
    },
    [loadTemplates]
  );

  const handleCreateTemplate = async (payload: CreateTemplatePayload) => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/workflow-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await staffAuthHeaders()),
        },
        body: JSON.stringify({
          name: payload.name,
          folder: "saved-templates",
          flowName: payload.name.replace(/\.tpl$/i, ""),
          builderDraft: { nodes: [], edges: [] },
        }),
      });
      const data = (await res.json()) as { template?: TemplateItem; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create template");

      const created = data.template;
      if (!created?.id) throw new Error("Template was not created");

      setCreatedTemplateName(created.name);
      setCreatedTemplateId(created.id);
      setCreateModalOpen(false);
      setSuccessModalOpen(true);
      await loadTemplates();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  const folderOptions = [
    { id: "saved-templates" as const, label: "Saved Templates", count: savedTemplates.length },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: PAGE_BG }}>
      <div className="w-full min-w-0 px-3 py-4 max-[369px]:px-2.5 sm:px-5 sm:py-6 lg:px-8">
        <header className="mb-6 sm:mb-8">
          <Link
            href="/admin_recruiter/settings/templates"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] hover:underline mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Templates
          </Link>
          <h1 className="text-[24px] font-semibold leading-[30px] text-[#000000] max-[369px]:text-[22px] max-[369px]:leading-[28px] min-[500px]:text-[30px] min-[500px]:leading-[36px]">
            My Templates
          </h1>
          <p className="mt-2 text-[14px] font-normal leading-5 text-[#374151] sm:mt-3 sm:text-[16px] sm:leading-6">
            Manage Workflow Templates
          </p>
        </header>

        <section className="rounded-xl border bg-white" style={{ borderColor: CARD_BORDER }}>
          <div
            className="flex items-center justify-end border-b px-3 py-3 max-[369px]:px-2.5 sm:px-4"
            style={{ borderColor: CARD_BORDER }}
          >
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setCreateModalOpen(true);
              }}
              disabled={creating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition hover:brightness-[0.97] disabled:opacity-60 min-[480px]:w-auto"
              style={{
                background:
                  "linear-gradient(90deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 70%, white) 100%)",
              }}
            >
              <CreateTemplateIcon />
              Create new template
            </button>
          </div>

          <div className="space-y-6 p-3 max-[369px]:p-2.5 sm:space-y-8 sm:p-5">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {loading ? (
              <CandidateDetailLoader label="Loading templates..." className="min-h-[280px] bg-transparent py-10" />
            ) : (
              <>
                <div>
                  <h2 className="mb-4 text-xl font-semibold leading-7" style={{ color: TEXT_PRIMARY }}>
                    Presets
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
                    {presets.length === 0 ? (
                      <p className="text-sm text-[#667085]">No presets yet.</p>
                    ) : (
                      presets.map((template) => (
                        <TemplateCard
                          key={template.id}
                          item={template}
                          canDelete={false}
                          copying={copyingId === template.id}
                          onCopy={handleCopyToWorkflow}
                          onView={handleViewTemplate}
                          onDelete={handleDeleteTemplate}
                        />
                      ))
                    )}
                  </div>
                </div>

                <hr className="border-0 border-t" style={{ borderColor: CARD_BORDER }} />

                <div>
                  <h2 className="mb-4 text-xl font-semibold leading-7" style={{ color: TEXT_PRIMARY }}>
                    Saved Templates
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
                    {savedTemplates.length === 0 ? (
                      <p className="text-sm text-[#667085]">
                        No saved templates yet. Save from the builder to see them here.
                      </p>
                    ) : (
                      savedTemplates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          item={template}
                          canDelete
                          copying={copyingId === template.id}
                          onCopy={handleCopyToWorkflow}
                          onView={handleViewTemplate}
                          onDelete={handleDeleteTemplate}
                        />
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <CreateTemplateModal
          open={createModalOpen}
          onClose={() => {
            if (creating) return;
            setCreateModalOpen(false);
            setCreateError(null);
          }}
          onCreate={handleCreateTemplate}
          folderOptions={folderOptions}
          creating={creating}
          error={createError}
        />
        <TemplateCreateSuccessModal
          open={successModalOpen}
          templateName={createdTemplateName || "Template"}
          templateId={createdTemplateId}
          onClose={() => setSuccessModalOpen(false)}
        />
      </div>
    </div>
  );
}
