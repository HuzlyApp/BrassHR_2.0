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
});
