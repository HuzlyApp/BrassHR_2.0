// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { JobsBulkSelectionSnackbar } from "./JobsBulkSelectionSnackbar";
import { BULK_SELECTION_SNACKBAR_BG } from "@/app/admin_recruiter/components/bulk-selection-snackbar-styles";

describe("JobsBulkSelectionSnackbar", () => {
  it("renders null when selected count is 0", () => {
    const { container } = render(
      <JobsBulkSelectionSnackbar
        totalSelectedCount={0}
        onUnpublish={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onExportCsv={vi.fn()}
        onExportXls={vi.fn()}
        onImportFromMsp={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders 1 job selected with action buttons and handles clicks", () => {
    const onUnpublish = vi.fn();
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    const onExportCsv = vi.fn();
    const onExportXls = vi.fn();
    const onImportFromMsp = vi.fn();
    const onClear = vi.fn();

    render(
      <JobsBulkSelectionSnackbar
        totalSelectedCount={1}
        onUnpublish={onUnpublish}
        onArchive={onArchive}
        onDelete={onDelete}
        onExportCsv={onExportCsv}
        onExportXls={onExportXls}
        onImportFromMsp={onImportFromMsp}
        onClear={onClear}
      />
    );

    expect(screen.getByText("1 job selected")).toBeTruthy();

    const unpublishBtn = screen.getByRole("button", { name: /unpublish/i });
    const archiveBtn = screen.getByRole("button", { name: /archive/i });
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    const clearBtn = screen.getByRole("button", { name: /clear selection/i });

    fireEvent.click(unpublishBtn);
    expect(onUnpublish).toHaveBeenCalledOnce();

    fireEvent.click(archiveBtn);
    expect(onArchive).toHaveBeenCalledOnce();

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledOnce();

    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledOnce();

    const snackbar = screen.getByRole("status");
    expect(snackbar.getAttribute("style")).toContain(`background-color: ${BULK_SELECTION_SNACKBAR_BG}`);
  });

  it("renders N jobs selected when multiple jobs are selected", () => {
    render(
      <JobsBulkSelectionSnackbar
        totalSelectedCount={5}
        onUnpublish={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onExportCsv={vi.fn()}
        onExportXls={vi.fn()}
        onImportFromMsp={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText("5 jobs selected")).toBeTruthy();
  });
});

