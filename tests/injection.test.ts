import { afterEach, describe, expect, it, vi } from "vitest";
import { logInjection } from "../src/lib/injection";

describe("logInjection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok after a successful injection POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK"
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await logInjection("https://worker.example", {
      clicks: 6,
      site: "thigh",
      notes: "late dose",
      preserveSchedule: true
    });

    expect(result).toEqual({ ok: true });
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

  it("fails before posting when the worker origin is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      logInjection("", {
        clicks: 6,
        site: null,
        notes: null,
        preserveSchedule: true
      })
    ).resolves.toEqual({ ok: false, reason: "worker origin missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
