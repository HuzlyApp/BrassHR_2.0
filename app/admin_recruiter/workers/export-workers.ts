import {
  exportRowsAsCsv,
  exportRowsAsXls,
  formatExportDate,
  type ExportColumn,
} from "@/lib/admin/export-list-download";
import type { WorkerListRow } from "./figma-demo-data";

const WORKER_EXPORT_COLUMNS: ExportColumn<WorkerListRow>[] = [
  { header: "Name", value: (row) => row.name },
  { header: "Experience", value: (row) => row.experience ?? "" },
  { header: "Email", value: (row) => row.email },
  { header: "Phone", value: (row) => row.phone },
  { header: "Assignment", value: (row) => row.assignment ?? "" },
  { header: "Assignment Start Date", value: (row) => row.assignmentStartDate ?? "" },
  { header: "Assignment End Date", value: (row) => row.assignmentEndDate ?? "" },
  { header: "Hired Date", value: (row) => row.hiredDate ?? "" },
  { header: "Job Role", value: (row) => row.jobRole },
  { header: "Pay Rate", value: (row) => row.payRate ?? "" },
  { header: "Bill Rate", value: (row) => row.billRate ?? "" },
  { header: "Overtime Rate", value: (row) => row.overtimeRate ?? "" },
  { header: "Status", value: (row) => row.status },
  { header: "Client", value: (row) => row.client ?? "" },
  { header: "Facilities", value: (row) => row.facilities?.join("; ") ?? "" },
  { header: "Manager", value: (row) => row.manager ?? "" },
  { header: "Location", value: (row) => row.location ?? "" },
  { header: "Worker Type", value: (row) => row.workerType ?? "" },
  { header: "Employment Type", value: (row) => row.employmentType ?? "" },
  { header: "Department", value: (row) => row.department ?? "" },
  { header: "Specialty", value: (row) => row.specialty ?? "" },
  { header: "Profession", value: (row) => row.profession ?? "" },
  { header: "Shift Type", value: (row) => row.shiftType ?? "" },
  { header: "Shift Details", value: (row) => row.shiftDetails ?? "" },
  { header: "Hours Per Week", value: (row) => row.hoursPerWeek ?? "" },
  { header: "Documents Count", value: (row) => (row.documentsCount != null ? String(row.documentsCount) : "") },
  { header: "Reference", value: (row) => row.reference ?? "" },
  { header: "Created Date", value: (row) => formatExportDate(row.createdAt) },
];

export function exportWorkersCsv(rows: WorkerListRow[], filename = "workers.csv") {
  exportRowsAsCsv(rows, WORKER_EXPORT_COLUMNS, filename);
}

export function exportWorkersXls(rows: WorkerListRow[], filename = "workers.xls") {
  exportRowsAsXls(rows, WORKER_EXPORT_COLUMNS, filename);
}
