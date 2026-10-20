// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfessionDocumentsPanel from "@/app/admin_recruiter/settings/ProfessionDocumentsPanel";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

type Profession = {
  id: string;
  name: string;
  documents: Array<{
    id: string;
    name: string;
    documentKind: "certificate" | "license";
    isRequired: boolean;
    hasExpiration: boolean;
    sortOrder: number;
  }>;
};

type AvailableProfession = {
  key: string;
  name: string;
  industryKey: string;
  industryLabel: string | null;
};

describe("ProfessionDocumentsPanel add profession", () => {
  let professions: Profession[];
  let availableProfessions: AvailableProfession[];
  let savedBody: { professionId?: string; documents?: Array<{ name: string; documentKind: string }> } | null;

  beforeEach(() => {
    professions = [{ id: "nursing", name: "Nursing", documents: [] }];
    availableProfessions = [
      { key: "it_support", name: "IT Support", industryKey: "technology", industryLabel: "Technology" },
    ];
    savedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.endsWith("/api/admin/profession-documents") && method === "GET") {
          return json({
            canManage: true,
            industryKey: "healthcare",
            industryLabel: "Healthcare",
            availableProfessions,
            professions,
          });
        }
        if (url.endsWith("/api/admin/professions") && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { catalogKey?: string };
          const chosen = availableProfessions.find((option) => option.key === body.catalogKey);
          const created = { id: "it-support", name: chosen?.name ?? "", documents: [] };
          professions = [...professions, created];
          availableProfessions = availableProfessions.filter((option) => option.key !== body.catalogKey);
          return json({ profession: { id: created.id, name: created.name } });
        }
        if (url.endsWith("/api/admin/profession-documents") && method === "PUT") {
          savedBody = JSON.parse(String(init?.body ?? "{}"));
          return json({
            documents: (savedBody?.documents ?? []).map((doc, index) => ({
              id: `saved-${index}`,
              name: doc.name,
              documentKind: doc.documentKind,
              isRequired: true,
              hasExpiration: true,
              sortOrder: (index + 1) * 10,
            })),
          });
        }
        return json({ error: "Not found" }, 404);
      })
    );
  });

  it("adds IT Support and saves a certificate and a license", async () => {
    const user = userEvent.setup();
    render(<ProfessionDocumentsPanel />);

    expect(await screen.findByRole("tab", { name: "Nursing" })).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Select profession"), "it_support");
    await user.click(screen.getByRole("button", { name: "Add profession" }));

    const added = await screen.findByRole("tab", { name: "IT Support" });
    expect(added.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("No certificates or licenses for IT Support yet.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add certificate or license" }));
    await user.type(screen.getByPlaceholderText("Certificate or license name"), "CompTIA A+");

    await user.click(screen.getByRole("button", { name: "Add certificate or license" }));
    const names = screen.getAllByPlaceholderText("Certificate or license name");
    await user.type(names[1], "IT Support license");
    await user.selectOptions(screen.getAllByLabelText("Document type")[1], "license");

    await user.click(screen.getByRole("button", { name: "Save documents" }));

    await waitFor(() => {
      expect(savedBody?.professionId).toBe("it-support");
    });
    expect(savedBody?.documents).toEqual([
      expect.objectContaining({ name: "CompTIA A+", documentKind: "certificate" }),
      expect.objectContaining({ name: "IT Support license", documentKind: "license" }),
    ]);
  });
});

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
