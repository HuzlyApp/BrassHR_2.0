import {
  exportRowsAsCsv,
  exportRowsAsXls,
  formatExportDate,
  type ExportColumn,
} from "@/lib/admin/export-list-download";
import type { WorkerListRow } from "./render-worker-list-cell";

const WORKER_EXPORT_COLUMNS: ExportColumn<WorkerListRow>[] = [
  { header: "Name", value: (row) => row.name },
  { header: "Reference", value: (row) => row.reference },
  { header: "Job name", value: (row) => row.role },
  { header: "Email", value: (row) => row.email },
  { header: "Phone", value: (row) => row.phone },
  { header: "Location", value: (row) => row.location },
  { header: "Status", value: (row) => row.status },
  { header: "Worker Type", value: (row) => row.workerType },
  { header: "Employment Type", value: (row) => row.employmentType },
  { header: "Created Date", value: (row) => formatExportDate(row.createdAt) },
];

export function exportWorkersCsv(rows: WorkerListRow[], filename = "workers.csv") {
  exportRowsAsCsv(rows, WORKER_EXPORT_COLUMNS, filename);
}

export function exportWorkersXls(rows: WorkerListRow[], filename = "workers.xls") {
  exportRowsAsXls(rows, WORKER_EXPORT_COLUMNS, filename);
}
