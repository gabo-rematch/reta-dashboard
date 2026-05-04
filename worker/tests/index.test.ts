import { beforeEach, describe, expect, it, vi } from "vitest";
import worker, { handleScheduled } from "../src/index";
import { sendWebPush } from "../src/push";
import type { PushSubscription } from "../src/push";

const allowedOrigin = "https://gabo-rematch.github.io";

describe("reta-worker fetch routes", () => {
  let env: TestEnv;

  beforeEach(() => {
    env = makeEnv();
  });

  it("returns the configured VAPID public key", async () => {
    const response = await worker.fetch(
      new Request("https://worker.test/vapid-public-key"),
      env,
      makeCtx()
    );

    await expect(response.json()).resolves.toEqual({ key: env.VAPID_PUBLIC_KEY });
  });

  it("stores the browser push subscription in KV", async () => {
    const subscription = makeSubscription();
    const response = await worker.fetch(
      new Request("https://worker.test/push/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: allowedOrigin
        },
        body: JSON.stringify(subscription)
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(env.KV.get("push:default")).resolves.toEqual(
      JSON.stringify(subscription)
    );
  });

  it("validates symptom inputs", async () => {
    await expect(postSymptom(env, { category: "bad" })).resolves.toHaveProperty(
      "status",
      400
    );
    await expect(postSymptom(env, { severity: 6 })).resolves.toHaveProperty(
      "status",
      400
    );
    await expect(postSymptom(env, { vomit: "yes" })).resolves.toHaveProperty(
      "status",
      400
    );
    await expect(postSymptom(env, { note: "x".repeat(501) })).resolves.toHaveProperty(
      "status",
      400
    );
  });

  it("requires drain authorization for pending symptoms", async () => {
    const response = await worker.fetch(
      new Request("https://worker.test/symptom/pending"),
      env,
      makeCtx()
    );

    expect(response.status).toBe(401);
  });

  it("returns queued symptom items in order", async () => {
    await env.KV.put(
      "queue:2026-05-04T10:00:00.000Z:bbb",
      JSON.stringify({
        ts: "2026-05-04T10:00:00.000Z",
        id: "bbb",
        category: "sleep",
        severity: 2,
        vomit: false,
        note: null
      })
    );
    await env.KV.put(
      "queue:2026-05-04T09:00:00.000Z:aaa",
      JSON.stringify({
        ts: "2026-05-04T09:00:00.000Z",
        id: "aaa",
        category: "gi",
        severity: 4,
        vomit: true,
        note: "nausea"
      })
    );

    const response = await worker.fetch(
      new Request("https://worker.test/symptom/pending", {
        headers: { Authorization: `Bearer ${env.DRAIN_TOKEN}` }
      }),
      env,
      makeCtx()
    );

    await expect(response.json()).resolves.toEqual([
      {
        key: "queue:2026-05-04T09:00:00.000Z:aaa",
        ts: "2026-05-04T09:00:00.000Z",
        id: "aaa",
        category: "gi",
        severity: 4,
        vomit: true,
        note: "nausea"
      },
      {
        key: "queue:2026-05-04T10:00:00.000Z:bbb",
        ts: "2026-05-04T10:00:00.000Z",
        id: "bbb",
        category: "sleep",
        severity: 2,
        vomit: false,
        note: null
      }
    ]);
  });

  it("deletes a queued symptom item by encoded key", async () => {
    const key = "queue:2026-05-04T09:00:00.000Z:aaa";
    await env.KV.put(key, "{}");

    const response = await worker.fetch(
      new Request(
        `https://worker.test/symptom/pending/${encodeURIComponent(key)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${env.DRAIN_TOKEN}` }
        }
      ),
      env,
      makeCtx()
    );

    expect(response.status).toBe(200);
    await expect(env.KV.get(key)).resolves.toBeNull();
  });

  it("responds to CORS preflight for allowed browser origins", async () => {
    const response = await worker.fetch(
      new Request("https://worker.test/symptom", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" }
      }),
      env,
      makeCtx()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173"
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
  });
});

describe("reta-worker scheduled pushes", () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = makeEnv();
    await env.KV.put("push:default", JSON.stringify(makeSubscription()));
  });

  it("sends the daily reminder payload", async () => {
    const sender = vi.fn().mockResolvedValue({ status: 201, expired: false });
    const ctx = makeCtx();

    await handleScheduled({ cron: "0 15 * * *" } as ScheduledEvent, env, ctx, sender);
    await ctx.flush();

    expect(sender).toHaveBeenCalledWith(
      makeSubscription(),
      JSON.stringify({
        title: "reta — log symptoms",
        body: "tap to log today's symptoms",
        url: `${allowedOrigin}/reta-dashboard/`
      }),
      {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT
      }
    );
  });

  it("sends the Saturday reminder payload", async () => {
    const sender = vi.fn().mockResolvedValue({ status: 201, expired: false });
    const ctx = makeCtx();

    await handleScheduled({ cron: "0 14 * * 6" } as ScheduledEvent, env, ctx, sender);
    await ctx.flush();

    expect(sender).toHaveBeenCalledWith(
      makeSubscription(),
      JSON.stringify({
        title: "reta — Saturday brief",
        body: "dose due in ~40 min · open dashboard",
        url: `${allowedOrigin}/reta-dashboard/`
      }),
      {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT
      }
    );
  });

  it("deletes expired subscriptions after 410 Gone", async () => {
    const sender = vi.fn().mockResolvedValue({ status: 410, expired: true });
    const ctx = makeCtx();

    await handleScheduled({ cron: "0 15 * * *" } as ScheduledEvent, env, ctx, sender);
    await ctx.flush();

    await expect(env.KV.get("push:default")).resolves.toBeNull();
  });
});

describe("sendWebPush", () => {
  it("posts an encrypted web push request and marks 410 responses as expired", async () => {
    const { publicKey, privateKey } = await makeVapidKeys();
    const subscription = await makeGeneratedSubscription();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWebPush(subscription, "payload", {
      publicKey,
      privateKey,
      subject: "mailto:test@example.com"
    });

    expect(result).toEqual({ status: 410, expired: true });
    expect(fetchMock).toHaveBeenCalledWith(
      subscription.endpoint,
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
        body: expect.any(Uint8Array)
      })
    );
  });
});

type TestEnv = {
  KV: MemoryKV;
  DASHBOARD_ORIGIN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  DRAIN_TOKEN: string;
};

class MemoryKV {
  private values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async list({ prefix = "" }: { prefix?: string } = {}): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
  }> {
    return {
      keys: Array.from(this.values.keys())
        .filter((name) => name.startsWith(prefix))
        .sort()
        .map((name) => ({ name })),
      list_complete: true
    };
  }
}

function makeEnv(): TestEnv {
  return {
    KV: new MemoryKV(),
    DASHBOARD_ORIGIN: allowedOrigin,
    VAPID_PUBLIC_KEY: `test-public-${crypto.randomUUID()}`,
    VAPID_PRIVATE_KEY: `test-private-${crypto.randomUUID()}`,
    VAPID_SUBJECT: "mailto:test@example.com",
    DRAIN_TOKEN: `test-drain-${crypto.randomUUID()}`
  };
}

function makeCtx(): ExecutionContext & { flush: () => Promise<void> } {
  const waits: Promise<unknown>[] = [];

  return {
    waitUntil(promise: Promise<unknown>) {
      waits.push(promise);
    },
    passThroughOnException: vi.fn(),
    props: {},
    flush: () => Promise.all(waits).then(() => undefined)
  } as unknown as ExecutionContext & { flush: () => Promise<void> };
}

async function postSymptom(
  env: TestEnv,
  overrides: Record<string, unknown>
): Promise<Response> {
  return worker.fetch(
    new Request("https://worker.test/symptom", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: allowedOrigin
      },
      body: JSON.stringify({
        category: "gi",
        severity: 1,
        vomit: false,
        note: null,
        ...overrides
      })
    }),
    env,
    makeCtx()
  );
}

function makeSubscription(): PushSubscription {
  return {
    endpoint: "https://push.example/send/1",
    keys: {
      p256dh: "p256dh",
      auth: "auth"
    }
  };
}

async function makeGeneratedSubscription(): Promise<PushSubscription> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const rawPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );
  const auth = new Uint8Array(16);
  crypto.getRandomValues(auth);

  return {
    endpoint: "https://push.example/send/1",
    keys: {
      p256dh: base64url(rawPublicKey),
      auth: base64url(auth)
    }
  };
}

async function makeVapidKeys(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const rawPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKey: base64url(rawPublicKey),
    privateKey: privateJwk.d!
  };
}

function base64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
