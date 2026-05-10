import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { Envelope } from "../src/lib/crypto";
import type { RetaSnapshot } from "../src/lib/types";

const snapshot: RetaSnapshot = {
  pens: [
    {
      id: 1,
      opened_on: "2026-05-02",
      total_mg: 30,
      mg_remaining: 29.6,
      lot: null,
      source: "grey market",
      is_active: 1,
      created_at: "2026-05-04T04:43:29.682220Z"
    }
  ],
  injections: [
    {
      id: 1,
      ts: "2026-05-02T14:40:00Z",
      dose_mg: 0.4,
      clicks: 4,
      site: "abdomen",
      pen_id: 1,
      notes: null
    }
  ],
  symptoms: [],
  daily_vitals: [],
  weekly_metrics: [],
  protocol_state: [
    {
      id: 1,
      current_week: 1,
      current_dose_mg: 0.4,
      current_step: 1,
      next_dose_due: "2026-05-09T14:40:00Z",
      escalation_locked_until_week: null,
      started_on: "2026-05-02",
      injection_weekday: 5
    }
  ],
  schema_version: [{ version: 1 }],
  whoop_sync_log: []
};

describe("App", () => {
  beforeEach(() => {
    // Fake the Date clock but let real timers run, so testing-library's polling
    // (`findByText`) actually advances and resolves.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-04T10:00:00Z"));
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the passphrase prompt when no stored key exists", async () => {
    vi.stubGlobal("fetch", mockEnvelopeFetch(await encryptForTest(snapshot, "test")));

    render(<App />);

    expect(await screen.findByLabelText(/passphrase/i)).not.toBeNull();
    expect(screen.getByRole("button", { name: /unlock/i })).not.toBeNull();
  });

  it("renders the dashboard after a correct passphrase", async () => {
    vi.stubGlobal("fetch", mockEnvelopeFetch(await encryptForTest(snapshot, "test")));

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/passphrase/i), {
      target: { value: "test" }
    });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    expect(await screen.findByText(/Week 1/)).not.toBeNull();
    expect(await screen.findByText("Injection log")).not.toBeNull();
    expect(screen.getByText("Symptom log")).not.toBeNull();
    expect(sessionStorage.getItem("reta-dashboard:passphrase")).toBe("test");
  });

  it("shows wrong passphrase after a bad decrypt attempt", async () => {
    vi.stubGlobal("fetch", mockEnvelopeFetch(await encryptForTest(snapshot, "test")));

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/passphrase/i), {
      target: { value: "bad-passphrase" }
    });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    expect(await screen.findByText("wrong passphrase")).not.toBeNull();
  });
});

function mockEnvelopeFetch(envelope: Envelope) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(envelope)
  });
}

async function encryptForTest(
  data: RetaSnapshot,
  passphrase: string
): Promise<Envelope> {
  const encoder = new TextEncoder();
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 20);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 1 },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  return {
    v: 1,
    kdf: "pbkdf2-sha256",
    iter: 1,
    salt: bytesToBase64url(salt),
    iv: bytesToBase64url(iv),
    ct: bytesToBase64url(new Uint8Array(ct))
  };
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
