"use client";

import { CheckCircle2, CircleAlert, Upload } from "lucide-react";
import OnboardingCheckbox from "@/app/components/OnboardingCheckbox";
import BrandedUploadIcon from "@/app/components/BrandedUploadIcon";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { hexToRgba } from "@/lib/tenant/tenant-branding";
import {
  APPLICANT_BTN_PRIMARY,
  APPLICANT_FORM_GRID,
} from "@/app/application/applicant-onboarding-responsive";
import {
  integrationProviderLabel,
  isApplicantWaitingGateStep,
  showsApplicantPartnerScreeningNotice,
} from "@/lib/onboarding/workflow-settings";
import {
  STEP_PREVIEW_SAMPLE,
  type StepPreviewModel,
  type StepPreviewState,
} from "@/lib/onboarding/step-preview-model";
import {
  PreviewActionRow,
  PreviewField,
  PreviewPageHeader,
  PreviewStatusBanner,
  PreviewTextarea,
  filled,
  showError,
} from "./preview-ui";

const SAMPLE_QUESTIONS = [
  { id: "work-auth", question: "Are you authorized to work in the United States?", type: "yes_no", required: true },
  { id: "years", question: "How many years of relevant experience do you have?", type: "number", required: true },
  {
    id: "shift",
    question: "Preferred shift",
    type: "single_select",
    required: false,
    options: ["Days", "Nights", "Weekends"],
  },
] as const;

function sampleValue(previewState: StepPreviewState, empty: string, sample: string) {
  return filled(previewState) ? sample : empty;
}

function ResumeUploadBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const branding = useTenantBranding();
  const hasFile = filled(previewState);
  const error = showError(previewState);
  const showProfile = previewState === "completed";

  if (showProfile) {
    return <ProfileFormBody model={model} previewState="filled" />;
  }

  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Upload your resume"}
        description={model.step.description}
      />
      <div
        className={`mt-4 rounded-xl border-2 border-dashed text-center ${hasFile ? "p-3" : "p-5"}`}
        style={{
          borderColor: branding.primaryHex,
          backgroundColor: hasFile ? hexToRgba(branding.primaryHex, 0.08) : undefined,
        }}
      >
        {hasFile ? (
          <div className="flex items-center gap-3 text-left">
            <BrandedSvgIcon src="/icons/pdf-icon.svg" className="h-6 w-6 shrink-0" color={branding.primaryHex} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: branding.secondaryHex }}>
                {STEP_PREVIEW_SAMPLE.resumeFileName}
              </p>
              <p className="text-[11px] text-slate-500">PDF · 1.2 MB</p>
            </div>
          </div>
        ) : (
          <>
            <BrandedUploadIcon className="mx-auto mb-3 h-12 w-12" primaryHex={branding.primaryHex} />
            <p className="mb-2 text-sm text-black">Drag your file(s) to start uploading</p>
            <p className="mb-2 text-xs text-[#6D6D6D]">OR</p>
            <button
              type="button"
              tabIndex={-1}
              className="rounded-md border px-5 py-1.5 text-sm"
              style={{ borderColor: branding.primaryHex, color: branding.primaryHex }}
            >
              Browse files
            </button>
            <p className="mt-3 text-xs text-[#6B7280]">Accepted formats: PDF, DOC, and DOCX (max 10 MB)</p>
          </>
        )}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-600">Please upload a resume in PDF, DOC, or DOCX format.</p>
      ) : null}
      <PreviewActionRow primaryLabel="Upload Resume and Continue" />
    </>
  );
}

function ProfileFormBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const required = model.step.is_required !== false;
  const error = showError(previewState);
  const sample = filled(previewState);
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Review resume details"}
        description={model.step.description}
      />
      <div className="mt-4 space-y-3">
        <div className={APPLICANT_FORM_GRID}>
          <PreviewField
            label="First Name"
            required={required}
            error={error}
            value={sampleValue(previewState, "", STEP_PREVIEW_SAMPLE.firstName)}
            placeholder="First Name"
          />
          <PreviewField
            label="Last Name"
            required={required}
            error={error}
            value={sampleValue(previewState, "", STEP_PREVIEW_SAMPLE.lastName)}
            placeholder="Last Name"
          />
        </div>
        <PreviewField
          label="Email"
          required={required}
          error={error}
          value={sampleValue(previewState, "", STEP_PREVIEW_SAMPLE.email)}
          placeholder="name@example.com"
        />
        <PreviewField
          label="Phone number"
          required={required}
          error={error}
          value={sampleValue(previewState, "", STEP_PREVIEW_SAMPLE.phone)}
          placeholder="(555) 000-0000"
        />
        <PreviewField
          label="Address"
          required={required}
          error={error}
          value={sampleValue(previewState, "", STEP_PREVIEW_SAMPLE.address1)}
          placeholder="Street address"
        />
      </div>
      <PreviewActionRow primaryLabel="Continue" />
    </>
  );
}

function JobApplicationBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const error = showError(previewState);
  const sample = filled(previewState);
  const prompt = model.prompt;
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Screening Questions"}
        description={
          model.step.description ||
          "Answer these job-specific questions before continuing your application."
        }
      />
      {prompt ? <p className="mt-3 text-sm text-slate-700">{prompt}</p> : null}
      <p className="mt-3 text-[11px] text-slate-400">
        Sample job questions — live postings supply the actual application fields.
      </p>
      <div className="mt-4 space-y-4">
        {SAMPLE_QUESTIONS.map((item) => (
          <fieldset key={item.id} className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">
              {item.question}
              {item.required ? <span className="text-rose-600"> *</span> : null}
            </legend>
            {item.type === "yes_no" ? (
              <div className="flex gap-4 text-sm text-slate-700">
                {["Yes", "No"].map((label) => (
                  <label key={label} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      tabIndex={-1}
                      readOnly
                      checked={sample && label === "Yes"}
                      onChange={() => undefined}
                    />
                    {label}
                  </label>
                ))}
              </div>
            ) : item.type === "number" ? (
              <input
                readOnly
                tabIndex={-1}
                value={sample ? "6" : ""}
                placeholder="0"
                className={`h-11 w-full rounded-md border bg-white px-3 text-sm text-[#1e293b] outline-none ${
                  error && item.required ? "border-red-400 ring-2 ring-red-100" : "border-slate-300"
                }`}
              />
            ) : (
              <select
                tabIndex={-1}
                value={sample ? "Days" : ""}
                onChange={() => undefined}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select an option</option>
                {(item.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
        ))}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-700">Required screening questions are unanswered.</p>
      ) : null}
      <PreviewActionRow primaryLabel="Continue" />
    </>
  );
}

function OfferAcceptanceBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const branding = useTenantBranding();
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Pay Rate Accepted"}
        description={model.step.description || "Review your pay rate details and choose to accept or decline."}
      />
      {previewState === "completed" ? (
        <PreviewStatusBanner tone="success">Pay rate accepted. Onboarding can continue.</PreviewStatusBanner>
      ) : previewState === "rejected" ? (
        <PreviewStatusBanner tone="danger">Pay rate declined. Recruiter will be notified.</PreviewStatusBanner>
      ) : previewState === "error" ? (
        <PreviewStatusBanner tone="warning">Choose Accept or Decline to continue.</PreviewStatusBanner>
      ) : null}
      <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Candidate</span>
          <span className="font-medium text-slate-800">
            {STEP_PREVIEW_SAMPLE.firstName} {STEP_PREVIEW_SAMPLE.lastName}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Position</span>
          <span className="font-medium text-slate-800">{STEP_PREVIEW_SAMPLE.position}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Facility</span>
          <span className="font-medium text-slate-800">{STEP_PREVIEW_SAMPLE.facility}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Compensation</span>
          <span className="font-medium text-slate-800">{STEP_PREVIEW_SAMPLE.compensation}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Start date</span>
          <span className="font-medium text-slate-800">{STEP_PREVIEW_SAMPLE.startDate}</span>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          tabIndex={-1}
          className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[11px] font-medium text-slate-700 sm:text-[12px]"
        >
          Decline Offer
        </button>
        <button
          type="button"
          tabIndex={-1}
          className={APPLICANT_BTN_PRIMARY}
          style={{ backgroundColor: branding.primaryHex }}
        >
          Accept Offer
        </button>
      </div>
    </>
  );
}

function AgreementBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const branding = useTenantBranding();
  const acknowledged = filled(previewState) || previewState === "completed";
  const signed = previewState === "completed";
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Independent Contractor Agreement"}
        description={model.step.description || "Review the agreement, acknowledge, and sign to continue."}
      />
      {model.firmaTemplateName ? (
        <p className="mt-3 text-[11px] text-slate-500">E-sign template: {model.firmaTemplateName}</p>
      ) : null}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">{model.step.title || "Agreement"}</p>
        <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          This is a sample agreement body. In production, the candidate reviews the configured
          document or signature template, then signs. No legal terms are submitted from this preview.
        </div>
        <div className="mt-4">
          <OnboardingCheckbox checked={acknowledged} onChange={() => undefined} disabled>
            <span className="text-sm text-slate-700">
              I have read and acknowledge this agreement
              {model.step.is_required ? <span className="text-red-500"> *</span> : null}
            </span>
          </OnboardingCheckbox>
        </div>
        <div
          className="mt-4 rounded-lg border border-dashed px-3 py-6 text-center text-xs text-slate-500"
          style={{ borderColor: branding.primaryHex }}
        >
          {signed ? (
            <span className="font-medium text-slate-800">
              Signed by {STEP_PREVIEW_SAMPLE.firstName} {STEP_PREVIEW_SAMPLE.lastName}
            </span>
          ) : (
            "Signature area"
          )}
        </div>
      </div>
      {showError(previewState) ? (
        <p className="mt-3 text-sm text-rose-600">Acknowledgement and signature are required.</p>
      ) : null}
      <PreviewActionRow primaryLabel={signed ? "Signed" : "Submit / Sign"} />
    </>
  );
}

function ApprovalBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const branding = useTenantBranding();
  const status =
    previewState === "approved"
      ? "approved"
      : previewState === "rejected"
        ? "rejected"
        : previewState === "error"
          ? "changes"
          : "pending";
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Manager / Facility Approval"}
        description={model.step.description || "Review the application and approve, request changes, or reject."}
      />
      {status === "approved" ? (
        <PreviewStatusBanner tone="success">Approved. The candidate can continue.</PreviewStatusBanner>
      ) : status === "rejected" ? (
        <PreviewStatusBanner tone="danger">Rejected. The candidate will be notified.</PreviewStatusBanner>
      ) : status === "changes" ? (
        <PreviewStatusBanner tone="warning">Request changes before this approval can complete.</PreviewStatusBanner>
      ) : (
        <PreviewStatusBanner tone="neutral">Pending approval — this is not a candidate task.</PreviewStatusBanner>
      )}
      <div className="mt-4 space-y-2 rounded-xl border border-slate-200 p-4 text-sm">
        <p>
          <span className="text-slate-500">Candidate:</span>{" "}
          <span className="font-medium text-slate-800">
            {STEP_PREVIEW_SAMPLE.firstName} {STEP_PREVIEW_SAMPLE.lastName}
          </span>
        </p>
        <p>
          <span className="text-slate-500">Position:</span>{" "}
          <span className="font-medium text-slate-800">{STEP_PREVIEW_SAMPLE.position}</span>
        </p>
        <p>
          <span className="text-slate-500">Facility:</span>{" "}
          <span className="font-medium text-slate-800">{STEP_PREVIEW_SAMPLE.facility}</span>
        </p>
        <p className="pt-2 text-slate-600">Application information / summary</p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-2">
        <button
          type="button"
          tabIndex={-1}
          className={APPLICANT_BTN_PRIMARY}
          style={{ backgroundColor: branding.primaryHex }}
        >
          Approve
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[11px] font-medium text-slate-700"
        >
          Request Changes
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="rounded-md border border-rose-200 bg-white px-3 py-2.5 text-[11px] font-medium text-rose-700"
        >
          Reject
        </button>
      </div>
    </>
  );
}

function DocumentUploadBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const branding = useTenantBranding();
  const docs = model.requiredDocuments.length
    ? model.requiredDocuments
    : [{ title: "Required document", description: "", is_required: model.step.is_required }];
  const uploaded = filled(previewState);
  return (
    <>
      <PreviewPageHeader title={model.step.title} description={model.step.description} />
      <div className="mt-4 space-y-3">
        {docs.map((doc) => (
          <div
            key={doc.title}
            className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3"
            style={{ borderColor: branding.primaryHex }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" style={{ color: branding.primaryHex }}>
                {doc.title}
              </p>
              <p className="text-[10px] text-slate-500">
                {doc.is_required ? "Required" : "Optional"}
                {uploaded ? " · uploaded" : ""}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: branding.primaryHex }}>
              <Upload className="h-3.5 w-3.5" />
              {uploaded ? "Replace" : "Upload"}
            </span>
          </div>
        ))}
      </div>
      {showError(previewState) ? (
        <p className="mt-3 text-sm text-rose-600">Upload all required documents to continue.</p>
      ) : null}
      <PreviewActionRow primaryLabel="Continue" />
    </>
  );
}

function ReferencesBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const minCount =
    typeof model.step.metadata.min_count === "number" ? model.step.metadata.min_count : 1;
  const sample = filled(previewState);
  const error = showError(previewState);
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Add Reference"}
        description={model.step.description || `Add at least ${minCount} complete professional reference.`}
      />
      <div className="mt-4">
        <p className="mb-3 text-[15px] font-bold text-slate-800">Reference 1</p>
        <div className={`${APPLICANT_FORM_GRID} mb-3`}>
          <PreviewField
            label="First Name"
            required
            error={error}
            value={sample ? "Alex" : ""}
            placeholder="First Name"
          />
          <PreviewField
            label="Last Name"
            required
            error={error}
            value={sample ? "Rivera" : ""}
            placeholder="Last Name"
          />
        </div>
        <div className={APPLICANT_FORM_GRID}>
          <PreviewField
            label="Phone"
            required
            error={error}
            value={sample ? STEP_PREVIEW_SAMPLE.phone : ""}
          />
          <PreviewField
            label="Email"
            required
            error={error}
            value={sample ? "alex.rivera@example.com" : ""}
          />
        </div>
      </div>
      <PreviewActionRow primaryLabel="Save and Continue" />
    </>
  );
}

function SkillsIntroBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Skill Assessment Quiz"}
        description={
          model.step.description ||
          "Use the scale below to describe your experience in each area listed in the assessment."
        }
      />
      <p className="mt-4 text-[13px] font-semibold text-slate-800">Proficiency Scale:</p>
      <div className="mt-2 divide-y divide-slate-200 border-t border-slate-200 text-[12px]">
        {[
          ["1", "No Experience"],
          ["2", "Limited Experience"],
          ["3", "Experienced"],
          ["4", "Highly Skilled"],
        ].map(([level, label]) => (
          <div key={level} className="flex gap-2 py-3">
            <span className="font-bold text-slate-800">{level}</span>
            <span className="font-semibold text-[color:var(--brand-primary)]">{label}</span>
          </div>
        ))}
      </div>
      {previewState === "completed" ? (
        <PreviewStatusBanner tone="success">Skill assessment completed.</PreviewStatusBanner>
      ) : null}
      <PreviewActionRow primaryLabel="Start Skill Assessment" />
    </>
  );
}

function CustomQuestionBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const required = model.settings.required === true || model.step.is_required;
  return (
    <>
      <PreviewPageHeader title={model.step.title} description={model.step.description} />
      {!isApplicantWaitingGateStep(model.step) ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {model.settings.clientPerforms
            ? "Complete this step in the application."
            : "Your recruiter or HR team will complete this step on your behalf."}
          {model.settings.timeline ? ` Expected timeline: ${model.settings.timeline}.` : ""}
          {!required ? " This step is optional." : null}
        </p>
      ) : null}
      <div className="mt-4">
        {model.step.step_key === "i9-right-to-work-verification" ? (
          <OnboardingCheckbox
            alignFirstLine
            checked={filled(previewState)}
            onChange={() => undefined}
            disabled
          >
            <span className="text-sm leading-5 text-slate-700">
              I confirm that I have completed Section 1 of Form I-9 and that the information provided is true and accurate to the best of my knowledge.
              {required ? <span className="text-red-600"> *</span> : null}
            </span>
          </OnboardingCheckbox>
        ) : (
          <PreviewTextarea
            label="Your response"
            required={required}
            error={showError(previewState)}
            value={sampleValue(previewState, "", "Sample response for this onboarding step.")}
            placeholder={model.prompt || "Enter information for this step"}
          />
        )}
      </div>
      <PreviewActionRow primaryLabel="Continue" />
    </>
  );
}

function WaitingOrScreeningBody({
  model,
  previewState,
}: {
  model: StepPreviewModel;
  previewState: StepPreviewState;
}) {
  const partnerLabel = integrationProviderLabel(model.step);
  const screening = showsApplicantPartnerScreeningNotice(model.step);
  return (
    <>
      <PreviewPageHeader title={model.step.title} description={model.step.description} />
      {previewState === "approved" ? (
        <PreviewStatusBanner tone="success">This check passed. The flow can continue.</PreviewStatusBanner>
      ) : previewState === "rejected" ? (
        <PreviewStatusBanner tone="danger">This check failed. HR is notified if configured.</PreviewStatusBanner>
      ) : previewState === "error" ? (
        <PreviewStatusBanner tone="warning">This step is still waiting on an internal result.</PreviewStatusBanner>
      ) : screening && partnerLabel ? (
        <PreviewStatusBanner tone="neutral">
          Your background screening is handled by {partnerLabel}.
          {model.settings.timeline ? ` Typical turnaround: ${model.settings.timeline}.` : ""}
        </PreviewStatusBanner>
      ) : (
        <PreviewStatusBanner tone="neutral">
          Your recruiter or HR team completes this approval. Continue does not unlock the next
          stage — you will get an email when they accept your placement.
        </PreviewStatusBanner>
      )}
      <PreviewActionRow primaryLabel="Continue" />
    </>
  );
}

function SummaryBody({ model, previewState }: { model: StepPreviewModel; previewState: StepPreviewState }) {
  const complete = previewState === "completed";
  const phaseSteps =
    model.selectedPhase === "post_hire" ? model.postHireSteps : model.preHireSteps;
  return (
    <>
      <PreviewPageHeader
        title={model.step.title || "Summary"}
        description={model.step.description || "Review and submit your application."}
      />
      <div className="mt-4 space-y-2">
        {phaseSteps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              complete || !step.current
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                : "border-amber-200 bg-amber-50/60"
            }`}
          >
            {complete || !step.current ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[color:var(--brand-primary)]" />
            ) : (
              <CircleAlert className="h-5 w-5 shrink-0 text-amber-500" />
            )}
            <p className="text-[13px] font-semibold text-slate-800">{step.title}</p>
          </div>
        ))}
      </div>
      <PreviewActionRow primaryLabel="Submit application" />
    </>
  );
}

function NotificationBody({ model }: { model: StepPreviewModel }) {
  return (
    <>
      <PreviewPageHeader title={model.step.title} description={model.step.description} />
      <PreviewStatusBanner tone="neutral">
        This step is sent or tracked internally ({model.settings.completionOwner || "admin"}). The
        candidate does not fill out a form here.
      </PreviewStatusBanner>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium text-slate-800">Sample message</p>
        <p className="mt-2 text-slate-600">
          Hi {STEP_PREVIEW_SAMPLE.firstName}, this is a preview of the {model.step.title.toLowerCase()}{" "}
          the {model.settings.completionOwner || "team"} would send.
        </p>
      </div>
    </>
  );
}

function UnsupportedBody({ model }: { model: StepPreviewModel }) {
  return (
    <div className="flex flex-1 flex-col justify-center px-1 py-6">
      <p className="text-sm font-semibold text-slate-900">Preview not available for this step yet.</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Step title</dt>
          <dd className="font-medium text-slate-800">{model.step.title}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Step type</dt>
          <dd className="font-medium text-slate-800">{model.libraryId || model.step.step_type}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Completion owner</dt>
          <dd className="font-medium text-slate-800">{model.settings.completionOwner || "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Phase</dt>
          <dd className="font-medium text-slate-800">{model.settings.phase}</dd>
        </div>
      </dl>
    </div>
  );
}

export function StepPreviewBody({
  model,
  previewState,
}: {
  model: StepPreviewModel;
  previewState: StepPreviewState;
}) {
  switch (model.kind) {
    case "resume_upload":
      return <ResumeUploadBody model={model} previewState={previewState} />;
    case "profile_form":
      return <ProfileFormBody model={model} previewState={previewState} />;
    case "job_application":
      return <JobApplicationBody model={model} previewState={previewState} />;
    case "offer_acceptance":
      return <OfferAcceptanceBody model={model} previewState={previewState} />;
    case "agreement":
      return <AgreementBody model={model} previewState={previewState} />;
    case "approval":
      return <ApprovalBody model={model} previewState={previewState} />;
    case "document_upload":
      return <DocumentUploadBody model={model} previewState={previewState} />;
    case "references":
      return <ReferencesBody model={model} previewState={previewState} />;
    case "skills_intro":
      return <SkillsIntroBody model={model} previewState={previewState} />;
    case "custom_question":
      return <CustomQuestionBody model={model} previewState={previewState} />;
    case "waiting_gate":
    case "screening":
      return <WaitingOrScreeningBody model={model} previewState={previewState} />;
    case "summary":
      return <SummaryBody model={model} previewState={previewState} />;
    case "notification":
      return <NotificationBody model={model} />;
    default:
      return <UnsupportedBody model={model} />;
  }
}
