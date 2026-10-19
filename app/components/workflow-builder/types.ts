export type StepColorKey =
  | "navy"
  | "purple"
  | "green"
  | "pink"
  | "amber"
  | "teal"
  | "rose"
  | "indigo"
  | "slate"
  | "denimBlue"
  | "pureBlue"
  | "royalPurple"
  | "amberGold"
  | "brightRose"
  | "limeGreen"
  | "slateGray"
  | "electricBlue"
  | "pastelPink"
  | "safetyOrange"
  | "neonCyan"
  | "emeraldGreen"
  | "tealNew";

export type StepDefinition = {
  id: string;
  label: string;
  icon: React.ReactNode;
  iconKey?: string;
  // color: StepColorKey;
  description?: string;
  keywords?: string[];
  defaultPhase?: StepSettings["phase"];
};

export type WorkflowInsertionPoint = {
  previousNodeId: string | null;
  nextNodeId: string | null;
};

export type WorkflowStepDragPayload = {
  stepDefinitionId: string;
  stepKey: string;
  name: string;
};

export type StepCategory = {
  id: string;
  label: string;
  steps: StepDefinition[];
};

export type StepSettings = {
  phase: "pre_hire" | "transition" | "post_hire";
  phaseOrder: number;
  stepOrder: number;
  required: boolean;
  isConditional: boolean;
  unlockCondition: string;
  completionOwner: string;
  clientPerforms: boolean;
  useBraasPartner: boolean;
  notifyHrOnFail: boolean;
  datePriority: string;
  provider: string;
  triggerAfter: string;
  notify: string;
  timeline: string;
  conditionalLogic: string;
  firmaRecruiterTemplateId?: string;
  firmaRecruiterTemplateName?: string;
  /** Candidate screen content for Post-Hire steps (see lib/onboarding/post-hire-step-screens.ts). */
  applicantInstructions?: string;
  contentUrl?: string;
  documentUrl?: string;
  acknowledgmentText?: string;
};

export type WorkflowNodeData = {
  stepId: string;
  label: string;
  description?: string | null;
  icon: React.ReactNode;
  day: number;
  required: boolean;
  settings: StepSettings;
  onDelete?: (id: string) => void;
  phaseBanner?: "pre_hire" | "placement_gate" | null;
  /** Set when the step's library stage conflicts with its Pre-Hire / Post-Hire phase. */
  alienStageWarning?: string | null;
  [key: string]: unknown;
};

/** Canvas-only placeholder; not saved to workflow config. */
export type DropZoneNodeData = {
  kind: "dropZone";
  highlighted?: boolean;
  libraryDragActive?: boolean;
  [key: string]: unknown;
};

export type WorkflowCanvasNodeData = WorkflowNodeData | DropZoneNodeData;

export function isDropZoneNode(
  node: import("@xyflow/react").Node<WorkflowCanvasNodeData>
): node is import("@xyflow/react").Node<DropZoneNodeData> {
  return node.type === "dropZone";
}

export function isStepNode(
  node: import("@xyflow/react").Node<WorkflowCanvasNodeData>
): node is import("@xyflow/react").Node<WorkflowNodeData> {
  return node.type === "step";
}

export type WorkflowState = {
  nodes: import("@xyflow/react").Node<WorkflowCanvasNodeData>[];
  edges: import("@xyflow/react").Edge[];
};

export const DEFAULT_STEP_SETTINGS: StepSettings = {
  phase: "pre_hire",
  phaseOrder: 1,
  stepOrder: 1,
  required: true,
  isConditional: false,
  unlockCondition: "",
  completionOwner: "applicant",
  clientPerforms: true,
  useBraasPartner: true,
  notifyHrOnFail: true,
  datePriority: "Day 1",
  provider: "Checker (connected)",
  triggerAfter: "Offer Acceptance",
  notify: "HR + Recruiter",
  timeline: "5 business days",
  conditionalLogic: "If result = fail → Pause flow + notify",
  firmaRecruiterTemplateId: "",
  firmaRecruiterTemplateName: "",
};
