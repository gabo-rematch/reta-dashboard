import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InjectionForm } from "../src/components/InjectionForm";

describe("InjectionForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a six-click injection with schedule preservation enabled by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK"
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InjectionForm defaultClicks={4} workerOrigin="https://worker.example" />);

    fireEvent.click(screen.getByRole("button", { name: /increase clicks/i }));
    fireEvent.click(screen.getByRole("button", { name: /increase clicks/i }));
    fireEvent.change(screen.getByLabelText(/site/i), {
      target: { value: "thigh" }
    });
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "late dose" }
    });
    fireEvent.click(screen.getByRole("button", { name: /log injection/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://worker.example/injection",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clicks: 6,
            site: "thigh",
            notes: "late dose",
            preserveSchedule: true
          })
        })
      );
    });
    expect(
      await screen.findByText("✓ logged · syncs to your Mac within 15 min")
    ).not.toBeNull();
  });
});
