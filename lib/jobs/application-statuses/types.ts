import type { ApplicationPipelineStatus } from "@/lib/jobs/application-status";

export type ApplicationStatusGroupRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  systemKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatusRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  systemKey: ApplicationPipelineStatus | "withdrawn" | null;
  groupId: string | null;
  groupName: string | null;
  groupDescription: string | null;
  groupSortOrder: number | null;
  groupSystemKey: string | null;
  /** Recommended, alternate, or closed. Null uses the name default. */
  buttonLane: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatusChangeSource = "USER" | "SYSTEM" | "API";

export type ApplicationStatusHistoryRecord = {
  id: string;
  applicationId: string;
  tenantId: string;
  fromStatusId: string | null;
  fromStatusName: string | null;
  toStatusId: string | null;
  toStatusName: string;
  changedByUserId: string | null;
  changedByName: string | null;
  changeSource: ApplicationStatusChangeSource;
  note: string | null;
  createdAt: string;
};

export type ChangeApplicationStatusResult = {
  unchanged: boolean;
  application: {
    id: string;
    statusId: string;
    status: string;
    statusName: string;
  };
  history: {
    id: string;
    fromStatus: { id: string | null; name: string | null };
    toStatus: { id: string; name: string };
    note: string | null;
    changedByUserId: string | null;
    changedAt: string;
  } | null;
  postHire?: {
    activated: boolean;
    alreadyActive: boolean;
    phase: string;
    emailSent: boolean;
  } | null;
};

export class ApplicationStatusError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "VALIDATION"
      | "INACTIVE"
      | "CONFLICT"
      | "INTERNAL"
      | "GATE_TASK_OPEN"
      | "INVALID_TRANSITION"
      | "STATUS_CHANGED",
    public readonly status: number = 400,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApplicationStatusError";
  }
}
