import { afterEach, describe, expect, it, vi } from "vitest";
import { logSymptom } from "../src/lib/symptom";

describe("logSymptom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok after a successful symptom POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK"
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await logSymptom("https://worker.example", {
      category: "gi",
      severity: 3,
      vomit: false,
      note: null
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example/symptom",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
    );
  });

  it("returns a reason when the worker rejects the symptom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request"
      })
    );

    await expect(
      logSymptom("https://worker.example", {
        category: "other",
        severity: 1,
        vomit: false,
        note: "test"
      })
    ).resolves.toEqual({ ok: false, reason: "400 Bad Request" });
  });

  it("fails before posting when the worker origin is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      logSymptom("", {
        category: "other",
        severity: 1,
        vomit: false,
        note: null
      })
    ).resolves.toEqual({ ok: false, reason: "worker origin missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns network failure reasons", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      logSymptom("https://worker.example", {
        category: "other",
        severity: 1,
        vomit: false,
        note: null
      })
    ).resolves.toEqual({ ok: false, reason: "offline" });
  });
});
