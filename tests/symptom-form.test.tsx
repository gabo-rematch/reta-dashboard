import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymptomForm } from "../src/components/SymptomForm";

describe("SymptomForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the symptom input to the configured worker origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK"
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SymptomForm workerOrigin="https://worker.example" />);

    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "sleep" }
    });
    fireEvent.click(screen.getByRole("button", { name: /increase severity/i }));
    fireEvent.click(screen.getByRole("button", { name: /increase severity/i }));
    fireEvent.click(screen.getByLabelText(/vomit/i));
    fireEvent.change(screen.getByLabelText(/note/i), {
      target: { value: "rough night" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^log$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://worker.example/symptom",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: "sleep",
            severity: 2,
            vomit: true,
            note: "rough night"
          })
        })
      );
    });
    expect(
      await screen.findByText("✓ logged · syncs to your Mac within 15 min")
    ).not.toBeNull();
    expect((screen.getByLabelText(/note/i) as HTMLInputElement).value).toBe("");
  });
});
