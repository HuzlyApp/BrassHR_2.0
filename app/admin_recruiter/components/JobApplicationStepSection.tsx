"use client";

import { JOB_APPLICATION_PARAMETER_FIELDS } from "@/lib/onboarding/job-application-parameters";
import type { JobApplicationStepView } from "@/lib/onboarding/job-application-step";

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function JobApplicationStepSection({ view }: { view: JobApplicationStepView }) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Job details</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {!view.job
            ? "This application isn't linked to a job requisition."
            : `From the job requisition${view.job.title ? ` for ${view.job.title}` : ""}. Review them, then mark this step completed or reject it.`}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {JOB_APPLICATION_PARAMETER_FIELDS.map((field) => {
            const value = view.values?.[field.key];
            return (
              <div key={field.key} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{field.label}</dt>
                <dd className="mt-0.5 break-words text-sm text-slate-800">
                  {value ? (field.date ? formatDate(value) : value) : "—"}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Screening answers</h3>
          {view.screening.length ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {view.screening.length}
            </span>
          ) : null}
        </div>
        {view.screening.length ? (
          <ul className="space-y-3">
            {view.screening.map((question) => (
              <li key={question.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-sm font-medium text-slate-900">
                  {question.question}
                  {question.isRequired ? <span className="ml-1 text-red-600">*</span> : null}
                </p>
                <p
                  className={`mt-1 whitespace-pre-wrap break-words text-sm ${
                    question.answered ? "text-slate-700" : "italic text-slate-400"
                  }`}
                >
                  {question.answered ? question.answerDisplay : "Not answered"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">This job has no screening questions for the candidate.</p>
        )}
      </section>
    </>
  );
}
