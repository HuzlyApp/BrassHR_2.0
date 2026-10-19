"use client";

import { useState } from "react";
import { ChevronDown, FileText, PanelRightClose } from "lucide-react";
import type { Node } from "@xyflow/react";
import {
  BRAND_CTA_GRADIENT,
  CARD_BORDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./constants";
import type { StepSettings, WorkflowNodeData, WorkflowState } from "./types";
import {
  WORKFLOW_DATE_PRIORITY_OPTIONS,
  WORKFLOW_PROVIDER_OPTIONS,
} from "@/lib/onboarding/normalize-workflow-settings";
import { isFirmaAttachableWorkflowStepId } from "@/lib/onboarding/firma-step-settings";
import {
  COMPLETION_OWNER_OPTIONS,
  isInternalLibraryStepId,
  resolveCompletionOwner,
} from "@/lib/onboarding/workflow-settings";
import { isCandidateCheckboxStep } from "@/lib/onboarding/candidate-checkbox-steps";
import { postHireScreenKindForStepId } from "@/lib/onboarding/post-hire-step-screens";
import { EmailTemplateSelect } from "@/app/components/onboarding/EmailTemplateSelect";
import { FirmaTemplateSelect } from "@/app/components/onboarding/FirmaTemplateSelect";
import { resolveHireLibraryIconPath } from "./hire-library-icons";
import { resolveCanvasStepThemeColor } from "./library-category-theme";
import StepPreviewPanel from "./step-preview/StepPreviewPanel";

type PanelTab = "settings" | "preview";

type StepsSettingsPanelProps = {
  node: Node<WorkflowNodeData> | null;
  workflowState: WorkflowState;
  onUpdate: (
    id: string,
    patch: Partial<WorkflowNodeData>,
    options?: { skipHistory?: boolean }
  ) => void;
  onSaveStep?: (id: string) => void;
  onCloneWorkflow?: () => void;
  readOnly?: boolean;
  compactMode?: boolean;
  panelOpen?: boolean;
  onPanelClose?: () => void;
};

export default function StepsSettingsPanel({
  node,
  workflowState,
  onUpdate,
  onSaveStep,
  onCloneWorkflow,
  readOnly = false,
  compactMode = false,
  panelOpen = true,
  onPanelClose,
}: StepsSettingsPanelProps) {
  const [tab, setTab] = useState<PanelTab>("settings");

  if (!compactMode && !panelOpen) {
    return null;
  }

  return (
    <aside
      className={
        compactMode
          ? `flex h-full min-h-0 w-[388px] shrink-0 flex-col border-l bg-[#ECF1F9] fixed inset-y-0 right-0 z-50 shadow-xl transition-transform duration-200 ${
              panelOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
            }`
          : "flex h-full min-h-0 w-[388px] shrink-0 flex-col border-l bg-[#ECF1F9]"
      }
      style={{ borderColor: CARD_BORDER }}
      aria-hidden={!panelOpen ? true : undefined}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b px-5 py-4"
        style={{ borderColor: CARD_BORDER }}
      >
        {onPanelClose ? (
          <button
            type="button"
            onClick={onPanelClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-white transition hover:bg-[#F9FAFB]"
            style={{ borderColor: CARD_BORDER }}
            aria-label="Close steps settings"
          >
            <PanelRightClose size={16} color={TEXT_SECONDARY} />
          </button>
        ) : null}
        <h2 className="text-[16.8px] font-bold leading-5 text-black">
          Steps Settings
        </h2>
      </div>

      {!node ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="text-sm" style={{ color: TEXT_SECONDARY }}>
            Select a step from the canvas to edit its settings.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex shrink-0 border-b px-2"
            style={{ borderColor: CARD_BORDER }}
            role="tablist"
            aria-label="Step panel"
          >
            {(["settings", "preview"] as const).map((id) => {
              const selected = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`step-panel-tab-${id}`}
                  aria-controls={`step-panel-${id}`}
                  aria-selected={selected}
                  onClick={() => setTab(id)}
                  className="relative flex-1 px-3 py-2.5 text-sm font-semibold"
                  style={{ color: selected ? TEXT_PRIMARY : TEXT_SECONDARY }}
                >
                  {id === "settings" ? "Settings" : "Preview"}
                  {selected ? (
                    <span
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full"
                      style={{ backgroundColor: "#012352" }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div
            id="step-panel-settings"
            role="tabpanel"
            aria-labelledby="step-panel-tab-settings"
            className={tab === "settings" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
            aria-hidden={tab !== "settings"}
          >
            <SettingsBody
              key={node.id}
              node={node}
              onUpdate={onUpdate}
              onSaveStep={onSaveStep}
              onCloneWorkflow={onCloneWorkflow}
              readOnly={readOnly}
            />
          </div>
          {tab === "preview" ? (
            <div
              id="step-panel-preview"
              role="tabpanel"
              aria-labelledby="step-panel-tab-preview"
              className="flex min-h-0 flex-1 flex-col"
            >
              <StepPreviewPanel node={node} workflowState={workflowState} />
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

type SettingsBodyProps = {
  node: NonNullable<StepsSettingsPanelProps["node"]>;
  onUpdate: StepsSettingsPanelProps["onUpdate"];
  onSaveStep?: StepsSettingsPanelProps["onSaveStep"];
  onCloneWorkflow?: StepsSettingsPanelProps["onCloneWorkflow"];
  readOnly?: boolean;
};

function SettingsBody({ node, onUpdate, onSaveStep, onCloneWorkflow, readOnly = false }: SettingsBodyProps) {
  const { settings } = node.data;
  const integrationEnabled = settings.useBraasPartner;
  const providerOptions = integrationEnabled
    ? [...WORKFLOW_PROVIDER_OPTIONS]
    : (["Manual", "Third-party API"] as const);
  const showFirmaTemplatePicker = isFirmaAttachableWorkflowStepId(node.data.stepId);
  const checkboxConfirmationStep = isCandidateCheckboxStep({
    metadata: { workflow_step_id: node.data.stepId },
    title: node.data.label,
  });
  const candidateScreenKind =
    settings.phase === "post_hire"
      ? postHireScreenKindForStepId(node.data.stepId) ?? (checkboxConfirmationStep ? "confirmation" : null)
      : checkboxConfirmationStep
        ? "confirmation"
        : null;
  const ownerLocked = isInternalLibraryStepId(node.data.stepId) || checkboxConfirmationStep;
  const stageName =
    typeof (settings as { stageName?: unknown }).stageName === "string"
      ? (settings as { stageName?: string }).stageName
      : null;
  const themeColor = resolveCanvasStepThemeColor(node.data.stepId, stageName);
  const iconPath = resolveHireLibraryIconPath(node.data.stepId);

  const patchSettings = (patch: Partial<StepSettings>, options?: { skipHistory?: boolean }) => {
    onUpdate(node.id, { settings: { ...settings, ...patch } }, options);
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md"
          style={{ backgroundColor: themeColor }}
        >
          {iconPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- hire-library SVG assets
            <img
              src={iconPath}
              alt=""
              className="h-5 w-5 object-contain brightness-0 invert"
              draggable={false}
            />
          ) : node.data.icon ? (
            <span className="flex h-full w-full items-center justify-center [&>*]:!h-full [&>*]:!w-full [&>*]:!bg-transparent [&_svg]:brightness-0 [&_svg]:invert">
              {node.data.icon}
            </span>
          ) : (
            <FileText size={18} className="text-white" strokeWidth={2} />
          )}
        </span>
        <span
          className="truncate text-sm font-semibold leading-5"
          style={{ color: "#012352" }}
        >
          {node.data.label}
        </span>
      </div>

      <div className={`flex flex-col gap-3 px-5 pb-4 ${readOnly ? "pointer-events-none opacity-60" : ""}`}>
        <TextField
          label="Step title"
          value={node.data.label}
          onChange={(v) => onUpdate(node.id, { label: v }, { skipHistory: true })}
          onCommit={(v) => onUpdate(node.id, { label: v })}
        />
        <TextField
          label="Description"
          value={node.data.description ?? ""}
          onChange={(v) => onUpdate(node.id, { description: v }, { skipHistory: true })}
          onCommit={(v) => onUpdate(node.id, { description: v })}
        />
        {showFirmaTemplatePicker ? (
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "#BC8B41", backgroundColor: "rgba(188, 139, 65, 0.06)" }}
            data-testid="firma-esign-settings"
          >
            <p className="mb-1 text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>
              E-Signature (Sign Document)
            </p>
            <p className="mb-3 text-[11px] leading-4" style={{ color: TEXT_SECONDARY }}>
              {candidateScreenKind
                ? "Attach a published signature template to have candidates sign it on this step's screen instead of the built-in form."
                : "Attach a published signature template so applicants see Sign Document on Authorizations & Documents."}
            </p>
            <FirmaTemplateSelect
              value={settings.firmaRecruiterTemplateId ?? ""}
              templateName={settings.firmaRecruiterTemplateName}
              disabled={readOnly}
              onChange={({ id, name }) =>
                patchSettings({
                  firmaRecruiterTemplateId: id,
                  firmaRecruiterTemplateName: name,
                })
              }
            />
          </div>
        ) : null}
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(255, 255, 255, 0.7)" }}
          data-testid="email-template-settings"
        >
          <EmailTemplateSelect
            value={settings.emailTemplateKey ?? ""}
            templateName={settings.emailTemplateName}
            disabled={readOnly}
            onChange={({ key, name }) =>
              patchSettings({
                emailTemplateKey: key,
                emailTemplateName: name,
              })
            }
          />
        </div>
        {candidateScreenKind ? (
          <div
            className="flex flex-col gap-3 rounded-xl border p-3"
            style={{ borderColor: CARD_BORDER }}
            data-testid="candidate-screen-content-settings"
          >
            <div>
              <p className="text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>
                Candidate screen content
              </p>
              <p className="mt-1 text-[11px] leading-4" style={{ color: TEXT_SECONDARY }}>
                Shown to the candidate on this step. Leave blank to use the defaults.
              </p>
            </div>
            <TextAreaField
              label="Instructions"
              value={settings.applicantInstructions ?? ""}
              onChange={(v) => patchSettings({ applicantInstructions: v }, { skipHistory: true })}
              onCommit={(v) => patchSettings({ applicantInstructions: v })}
            />
            {candidateScreenKind === "training" || candidateScreenKind === "acknowledgment" ? (
              <TextField
                label="Video or training link (YouTube, Vimeo, Loom, MP4 or any URL)"
                value={settings.contentUrl ?? ""}
                onChange={(v) => patchSettings({ contentUrl: v }, { skipHistory: true })}
                onCommit={(v) => patchSettings({ contentUrl: v.trim() })}
              />
            ) : null}
            {candidateScreenKind === "training" || candidateScreenKind === "acknowledgment" ? (
              <TextField
                label="Document link (policy, handbook, packet)"
                value={settings.documentUrl ?? ""}
                onChange={(v) => patchSettings({ documentUrl: v }, { skipHistory: true })}
                onCommit={(v) => patchSettings({ documentUrl: v.trim() })}
              />
            ) : null}
            <TextAreaField
              label={
                candidateScreenKind === "training"
                  ? "Completion statement"
                  : candidateScreenKind === "direct_deposit"
                    ? "Deposit authorization statement"
                    : candidateScreenKind === "confirmation"
                      ? "Confirmation message"
                      : "Acknowledgment / attestation statement"
              }
              value={settings.acknowledgmentText ?? ""}
              onChange={(v) => patchSettings({ acknowledgmentText: v }, { skipHistory: true })}
              onCommit={(v) => patchSettings({ acknowledgmentText: v })}
            />
          </div>
        ) : null}
        <ToggleRow
          label="Required"
          value={node.data.required}
          onChange={(v) => onUpdate(node.id, { required: v })}
        />
        <SelectField
          label="Phase"
          value={settings.phase === "transition" ? "pre_hire" : settings.phase}
          options={["pre_hire", "post_hire"]}
          optionLabels={{ pre_hire: "Pre-Hire", post_hire: "Post-Hire" }}
          hint="Approval is a step type. Pre-Hire is candidate evaluation; Post-Hire is onboarding after acceptance."
          onChange={(v) => {
            const next = (v as StepSettings["phase"]) ?? "pre_hire";
            const current = settings.phase === "transition" ? "pre_hire" : settings.phase;
            if (
              current !== next &&
              typeof window !== "undefined" &&
              !window.confirm(
                "Moving this step between Pre-Hire and Post-Hire can affect existing candidate progress and document associations. Continue?"
              )
            ) {
              return;
            }
            patchSettings({
              phase: next,
              phaseOrder: next === "post_hire" ? 3 : 1,
            });
          }}
        />
        <SelectField
          label="Completion owner"
          value={resolveCompletionOwner(settings.completionOwner, node.data.stepId)}
          options={COMPLETION_OWNER_OPTIONS.map((option) => option.value)}
          optionLabels={Object.fromEntries(
            COMPLETION_OWNER_OPTIONS.map((option) => [option.value, option.label])
          )}
          disabled={ownerLocked}
          hint={
            checkboxConfirmationStep
              ? "The candidate checks a confirmation message. Their answer is saved on this step."
              : ownerLocked
                ? "This step is always completed by the recruiter."
                : "Candidate steps appear in the candidate portal. Recruiter steps appear only for staff."
          }
          onChange={(v) => patchSettings({ completionOwner: v })}
        />
        <ToggleRow
          label="Conditional step"
          value={settings.isConditional === true}
          onChange={(v) => patchSettings({ isConditional: v })}
        />
        <TextField
          label="Unlock condition"
          value={settings.unlockCondition ?? ""}
          onChange={(v) => patchSettings({ unlockCondition: v }, { skipHistory: true })}
          onCommit={(v) => patchSettings({ unlockCondition: v })}
        />
        <ToggleRow
          label="Client performs"
          value={settings.clientPerforms}
          onChange={(v) => patchSettings({ clientPerforms: v })}
        />
        <ToggleRow
          label="Use integration partner"
          value={settings.useBraasPartner}
          onChange={(v) => {
            const next: Partial<StepSettings> = { useBraasPartner: v };
            if (!v && settings.provider === "Checker (connected)") {
              next.provider = "Manual";
            }
            patchSettings(next);
          }}
        />
        <CheckboxRow
          label="Notify HR on fail"
          value={settings.notifyHrOnFail}
          onChange={(v) => patchSettings({ notifyHrOnFail: v })}
        />
      </div>

      <div
        className={`flex flex-col gap-4 border-t px-5 py-4 ${readOnly ? "pointer-events-none opacity-60" : ""}`}
        style={{ borderColor: CARD_BORDER }}
      >
        <SelectField
          label="Date Priority"
          value={settings.datePriority}
          options={[...WORKFLOW_DATE_PRIORITY_OPTIONS]}
          onChange={(v) => patchSettings({ datePriority: v })}
        />
        <SelectField
          label="Provider"
          value={settings.provider}
          options={[...providerOptions]}
          disabled={!integrationEnabled}
          hint={
            integrationEnabled
              ? undefined
              : "Enable “Use integration partner” to use Checker or other connected providers."
          }
          onChange={(v) => patchSettings({ provider: v })}
        />
        <SelectField
          label="Trigger after"
          value={settings.triggerAfter}
          options={["Offer Acceptance", "Document Upload", "Background Check", "Day 1 Start"]}
          onChange={(v) => patchSettings({ triggerAfter: v })}
        />
        <SelectField
          label="Notify"
          value={settings.notify}
          options={["HR + Recruiter", "HR Only", "Manager", "Candidate"]}
          onChange={(v) => patchSettings({ notify: v })}
        />
        <SelectField
          label="Timeline"
          value={settings.timeline}
          options={["1 business day", "3 business days", "5 business days", "10 business days"]}
          onChange={(v) => patchSettings({ timeline: v })}
        />
        <TextField
          label="Conditional Logic"
          value={settings.conditionalLogic}
          onChange={(v) => patchSettings({ conditionalLogic: v }, { skipHistory: true })}
          onCommit={(v) => patchSettings({ conditionalLogic: v })}
        />
      </div>

      {!readOnly ? (
      <div className="mt-auto flex flex-col gap-2.5 border-t px-5 py-4" style={{ borderColor: CARD_BORDER }}>
        <button
          type="button"
          onClick={() => onSaveStep?.(node.id)}
          className="h-10 w-full rounded-lg text-sm font-semibold text-white transition hover:brightness-[0.97]"
          style={{ background: BRAND_CTA_GRADIENT }}
        >
          Save Step
        </button>
        <button
          type="button"
          onClick={onCloneWorkflow}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border bg-white text-sm font-semibold transition hover:bg-[#fafafa]"
          style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
        >
          Clone Workflow
        </button>
      </div>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm leading-5" style={{ color: TEXT_PRIMARY }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="relative h-[22px] w-10 shrink-0 rounded-full transition"
        style={{ backgroundColor: value ? "#012352" : "#e4e7ec" }}
      >
        <span
          className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
          style={{ left: value ? 20 : 2 }}
        />
      </button>
    </label>
  );
}

function CheckboxRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[18px] w-[18px] rounded border-[#d0d5dd] accent-[#012352]"
      />
      <span className="text-sm leading-5" style={{ color: TEXT_PRIMARY }}>
        {label}
      </span>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  optionLabels,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-medium leading-4"
        style={{ color: TEXT_SECONDARY }}
      >
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-lg border bg-white px-3 pr-9 text-sm outline-none transition focus:border-[#BC8B41] focus:ring-2 focus:ring-[#BC8B41]/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {optionLabels?.[opt] ?? opt}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          color="#98a2b3"
        />
      </div>
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-4" style={{ color: TEXT_SECONDARY }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
}) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-medium leading-4"
        style={{ color: TEXT_SECONDARY }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
        className="h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition focus:border-[#BC8B41] focus:ring-2 focus:ring-[#BC8B41]/25"
        style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
}) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-medium leading-4"
        style={{ color: TEXT_SECONDARY }}
      >
        {label}
      </label>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
        className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-[#BC8B41] focus:ring-2 focus:ring-[#BC8B41]/25"
        style={{ borderColor: CARD_BORDER, color: TEXT_PRIMARY }}
      />
    </div>
  );
}
