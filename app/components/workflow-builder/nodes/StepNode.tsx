"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, FileText, X, Lock } from "lucide-react";
import { GOLD } from "../constants";
import { resolveHireLibraryIconPath } from "../hire-library-icons";
import { resolveCanvasStepThemeColor } from "../library-category-theme";
import type { WorkflowNodeData } from "../types";

type StepNodeType = Node<WorkflowNodeData>;

export default function StepNode(props: NodeProps<StepNodeType>) {
  const { data, id, selected } = props;
  const onDelete = data.onDelete;
  const lockedFirstStep = data.lockedFirstStep === true;
  const alienStageWarning =
    typeof data.alienStageWarning === "string" && data.alienStageWarning.trim()
      ? data.alienStageWarning.trim()
      : null;
  const phaseLabel =
    data.settings.phase === "post_hire"
      ? "Post-Hire"
      : "Pre-Hire";

  const stageName =
    typeof (data.settings as { stageName?: unknown }).stageName === "string"
      ? (data.settings as { stageName?: string }).stageName
      : null;
  const themeColor = resolveCanvasStepThemeColor(data.stepId, stageName);
  const iconPath = resolveHireLibraryIconPath(data.stepId);
  const borderColor = alienStageWarning ? "#D97706" : selected ? GOLD : themeColor;

  return (
    <div className="relative">
      {data.phaseBanner === "pre_hire" ? (
        <div className="absolute -top-12 left-0 w-[232px] text-center">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pre-Hire
            </p>
            <p className="text-[11px] font-medium text-slate-700">Candidate Qualification</p>
          </div>
        </div>
      ) : null}
      {data.phaseBanner === "placement_gate" ? (
        <div className="absolute -top-[4.75rem] left-0 w-[232px] text-center">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">
              Candidate Accepted / Placement Activated
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Post-Hire
            </p>
            <p className="text-[11px] font-medium text-slate-700">Employee / Contractor Onboarding</p>
          </div>
        </div>
      ) : null}
      <div
        className="h-[70px] w-[232px] min-h-[46px] min-w-[100px] overflow-hidden rounded-md bg-white transition"
        style={{
          border: `1px solid ${borderColor}`,
        }}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{
            width: 8,
            height: 8,
            border: "2px solid white",
          }}
        />

        <div className="flex h-full flex-col gap-2 p-2">
          <div className="flex items-center gap-2">
            <span
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-md"
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
              ) : data.icon ? (
                <span className="flex h-full w-full items-center justify-center [&>*]:!h-full [&>*]:!w-full [&>*]:!bg-transparent [&_svg]:brightness-0 [&_svg]:invert">
                  {data.icon}
                </span>
              ) : (
                <FileText size={18} className="text-white" strokeWidth={2} />
              )}
            </span>
            <span className="flex-1 whitespace-normal break-words text-black text-[11px] font-semibold leading-[14px]">
              {data.label}
            </span>

            {lockedFirstStep ? (
              <span
                className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-900"
                title="Required first step"
              >
                <Lock size={10} strokeWidth={2.5} aria-hidden />
              </span>
            ) : null}

            {selected && onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(id);
                }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove step"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            ) : null}
          </div>

          {alienStageWarning ? (
            <div
              className="flex items-start gap-1 text-[9px] font-medium leading-3 text-amber-800"
              role="alert"
            >
              <AlertTriangle size={10} className="mt-px shrink-0" strokeWidth={2.5} aria-hidden />
              <span>{alienStageWarning}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-700">
                  {phaseLabel}
                </span>
              </div>

              <div
                className="flex items-center gap-1.5"
                style={{
                  fontFamily: "Inter, Arial, sans-serif",
                  fontWeight: 400,
                  fontSize: "10px",
                  lineHeight: "15px",
                  letterSpacing: "0",
                }}
              >
                <span style={{ color: "#101828" }}>
                  Day {data.day}
                </span>
                {data.required ? (
                  <>
                    <span style={{ color: "#d0d5dd" }}>•</span>
                    <span style={{ color: "#DC2626" }}>
                      Required
                    </span>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            width: 8,
            height: 8,
            border: "2px solid white",
          }}
        />
      </div>
    </div>
  );
}
