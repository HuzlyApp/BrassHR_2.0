// @vitest-environment happy-dom

import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StageConfigModal } from "./StageConfigModal";
import type { StageConfigDraft } from "./pre-hire-stage-draft";

const emptyDraft: StageConfigDraft = {
  lanes: { happy_path: [], alternate: [], closed: [] },
  reasonCodes: { alternate: [], closed: [] },
};

const screeningDraft: StageConfigDraft = {
  lanes: {
    happy_path: [
      { id: "attempted", name: "Attempted Contact", noteId: null, note: null },
      { id: "complete", name: "Screening Complete", noteId: null, note: null },
    ],
    alternate: [],
    closed: [{ id: "closed", name: "Application Closed", noteId: null, note: null }],
  },
  reasonCodes: {
    alternate: ["Unreachable"],
    closed: ["Not a Fit", "Candidate Withdrew"],
  },
};

function renderModal(
  draft: StageConfigDraft,
  overrides: Partial<ComponentProps<typeof StageConfigModal>> = {}
) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <StageConfigModal
      stage="Screening"
      summary="Recruiter screen, skills, and references"
      initial={draft}
      catalog={[
        { id: "attempted", name: "Attempted Contact" },
        { id: "complete", name: "Screening Complete" },
        { id: "closed", name: "Application Closed" },
        { id: "follow", name: "Follow-up Needed" },
      ]}
      reasonSuggestions={{
        alternate: ["Unreachable"],
        closed: ["Not a Fit", "Candidate Withdrew", "C2C Only"],
      }}
      canManage
      saving={false}
      saveError={null}
      inheritsDefault={false}
      workflowName="All workflows"
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />
  );
  return { onClose, onSave };
}

describe("StageConfigModal", () => {
  it("shows an empty stage without requiring alternate or closing statuses", () => {
    renderModal(emptyDraft, { stage: "Approvals", summary: "Final approval before hire" });
    expect(screen.getByRole("heading", { name: "Approvals" })).toBeTruthy();
    expect(screen.getByText("No recommended statuses yet.")).toBeTruthy();
    expect(screen.getByText("No alternate statuses. This category is optional.")).toBeTruthy();
    expect(screen.getByText("No closing statuses. This category is optional.")).toBeTruthy();
    expect(screen.getAllByText("No reason codes.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
  });

  it("keeps reason codes inside their own section and saves the edited lists", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal(screeningDraft);

    expect(screen.getByText("Unreachable")).toBeTruthy();
    expect(screen.getByText("Not a Fit")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Unreachable" })).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Add an existing status to Alternate"), "follow");
    const alternateReasons = screen.getByLabelText("Search or add an alternate reason code");
    await user.type(alternateReasons, "C2C Only");
    await user.click(alternateReasons.parentElement!.querySelector("button")!);
    expect(screen.getByText("C2C Only belongs with Closing.")).toBeTruthy();
    await user.clear(alternateReasons);

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0][0] as StageConfigDraft;
    expect(draft.lanes.alternate.map((status) => status.name)).toEqual(["Follow-up Needed"]);
    expect(draft.lanes.closed.map((status) => status.name)).toEqual(["Application Closed"]);
    expect(draft.reasonCodes.alternate).toEqual(["Unreachable"]);
    expect(draft.reasonCodes.closed).toEqual(["Not a Fit", "Candidate Withdrew"]);
  });

  it("warns before discarding unsaved changes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal(screeningDraft);
    await user.click(screen.getByRole("button", { name: "Remove Unreachable" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Unreachable")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renames a status without changing its id", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal(screeningDraft);
    await user.click(screen.getByRole("button", { name: "Rename Attempted Contact" }));
    const input = screen.getByLabelText("New name for Attempted Contact");
    await user.clear(input);
    await user.type(input, "Contact Attempted");
    await user.click(screen.getByRole("button", { name: "Apply status name" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0][0] as StageConfigDraft;
    expect(draft.lanes.happy_path[0]).toMatchObject({
      id: "attempted",
      name: "Contact Attempted",
    });
  });

  it("shows tied candidates and jobs and does not delete that status", async () => {
    const user = userEvent.setup();
    const onDeleteStatus = vi.fn();
    const onInspectStatus = vi.fn(async () => ({
      versions: [
        {
          id: "v2",
          statusId: "attempted",
          versionNumber: 2,
          name: "Attempted Contact",
          previousName: "Screening",
          description: null,
          editedBy: "user-1",
          editedByName: "Ada Admin",
          editedAt: "2026-10-22T15:00:00.000Z",
        },
      ],
      usage: {
        total: 1,
        records: [
          {
            applicationId: "app-1",
            candidateName: "Jamie Cole",
            workerId: "worker-1",
            jobId: "job-1",
            jobTitle: "ICU Nurse",
          },
        ],
      },
    }));
    renderModal(screeningDraft, { onInspectStatus, onDeleteStatus });
    await user.click(screen.getByRole("button", { name: "Version history for Attempted Contact" }));
    expect(await screen.findByText(/Ada Admin/)).toBeTruthy();
    expect(screen.getByText(/Renamed from Screening/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete Attempted Contact" }));
    expect(await screen.findByText("Jamie Cole")).toBeTruthy();
    expect(screen.getByText("ICU Nurse")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Attempted Contact will not be deleted" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete status" })).toBeNull();
    expect(onDeleteStatus).not.toHaveBeenCalled();
  });

  it("deletes a status only when no candidate or job uses it", async () => {
    const user = userEvent.setup();
    const onDeleteStatus = vi.fn(async () => undefined);
    const onInspectStatus = vi.fn(async () => ({
      versions: [],
      usage: { total: 0, records: [] },
    }));
    renderModal(screeningDraft, { onInspectStatus, onDeleteStatus });
    await user.click(screen.getByRole("button", { name: "Delete Application Closed" }));
    expect(await screen.findByRole("heading", { name: "Delete Application Closed?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete status" }));
    expect(onDeleteStatus).toHaveBeenCalledWith("closed");
    expect(screen.queryByRole("button", { name: "Delete Application Closed" })).toBeNull();
  });
});
