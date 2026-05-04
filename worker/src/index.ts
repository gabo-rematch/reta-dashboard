import { sendWebPush } from "./push";
import type { PushSubscription } from "./push";

export type Env = {
  KV: KVNamespace;
  DASHBOARD_ORIGIN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  DRAIN_TOKEN: string;
};

type SymptomRecord = {
  ts: string;
  id: string;
  category: string;
  severity: number;
  vomit: boolean;
  note: string | null;
};

type PushSender = typeof sendWebPush;

const allowedCategories = new Set([
  "gi",
  "dysesthesia",
  "hr",
  "sleep",
  "injection-site",
  "other"
]);
const localOrigins = new Set(["http://localhost:5173", "http://localhost:8788"]);

const worker: ExportedHandler<Env> = {
  fetch: fetchHandler,
  scheduled(event, env, ctx) {
    return handleScheduled(event, env, ctx);
  }
};

export default worker;

export async function fetchHandler(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, env)
    });
  }

  if (request.method === "GET" && url.pathname === "/healthz") {
    return new Response("ok", { headers: corsHeaders(request, env) });
  }

  if (request.method === "GET" && url.pathname === "/vapid-public-key") {
    return json(request, env, { key: env.VAPID_PUBLIC_KEY });
  }

  if (request.method === "POST" && url.pathname === "/push/register") {
    const forbidden = rejectBadBrowserOrigin(request, env);
    if (forbidden) {
      return forbidden;
    }

    const subscription = await readJson<PushSubscription>(request);

    if (!isPushSubscription(subscription)) {
      return json(request, env, { ok: false, reason: "invalid subscription" }, 400);
    }

    await env.KV.put("push:default", JSON.stringify(subscription));

    return json(request, env, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/push/unregister") {
    const forbidden = rejectBadBrowserOrigin(request, env);
    if (forbidden) {
      return forbidden;
    }

    await env.KV.delete("push:default");

    return json(request, env, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/symptom") {
    const forbidden = rejectBadBrowserOrigin(request, env);
    if (forbidden) {
      return forbidden;
    }

    const input = await readJson<unknown>(request);
    const validation = validateSymptom(input);

    if (!validation.ok) {
      return json(request, env, { ok: false, reason: validation.reason }, 400);
    }

    const ts = new Date().toISOString();
    const id = randomId();
    const record: SymptomRecord = { ts, id, ...validation.value };
    const key = `queue:${ts}:${id}`;
    await env.KV.put(key, JSON.stringify(record));

    return json(request, env, { ok: true, id });
  }

  if (request.method === "GET" && url.pathname === "/symptom/pending") {
    const unauthorized = rejectBadDrainAuth(request, env);
    if (unauthorized) {
      return unauthorized;
    }

    const items = await pendingSymptoms(env);

    return json(request, env, items);
  }

  if (
    request.method === "DELETE" &&
    url.pathname.startsWith("/symptom/pending/")
  ) {
    const unauthorized = rejectBadDrainAuth(request, env);
    if (unauthorized) {
      return unauthorized;
    }

    const key = decodeURIComponent(url.pathname.slice("/symptom/pending/".length));

    if (!key.startsWith("queue:")) {
      return json(request, env, { ok: false, reason: "invalid queue key" }, 400);
    }

    await env.KV.delete(key);

    return json(request, env, { ok: true });
  }

  return json(request, env, { ok: false, reason: "not found" }, 404);
}

export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
  sender: PushSender = sendWebPush
): Promise<void> {
  const rawSubscription = await env.KV.get("push:default");

  if (!rawSubscription) {
    console.log("no push subscription registered");
    return;
  }

  const payload = scheduledPayload(event.cron, env);

  if (!payload) {
    console.log(`no scheduled payload for cron ${event.cron}`);
    return;
  }

  const task = (async () => {
    const result = await sender(rawJson<PushSubscription>(rawSubscription), JSON.stringify(payload), {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT
    });

    if (result.expired || result.status === 410) {
      await env.KV.delete("push:default");
      console.log("deleted expired push subscription");
    }
  })();

  ctx.waitUntil(task);
}

function scheduledPayload(cron: string, env: Env) {
  if (cron === "0 15 * * *") {
    return {
      title: "reta — log symptoms",
      body: "tap to log today's symptoms",
      url: `${env.DASHBOARD_ORIGIN}/reta-dashboard/`
    };
  }

  if (cron === "0 14 * * 6") {
    return {
      title: "reta — Saturday brief",
      body: "dose due in ~40 min · open dashboard",
      url: `${env.DASHBOARD_ORIGIN}/reta-dashboard/`
    };
  }

  return null;
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    Vary: "Origin"
  });
  const origin = request.headers.get("Origin");
  headers.set(
    "Access-Control-Allow-Origin",
    origin && isAllowedBrowserOrigin(origin, env) ? origin : env.DASHBOARD_ORIGIN
  );

  return headers;
}

function json(
  request: Request,
  env: Env,
  value: unknown,
  status = 200
): Response {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(value), { status, headers });
}

function rejectBadBrowserOrigin(request: Request, env: Env): Response | null {
  const origin = request.headers.get("Origin");

  if (origin && isAllowedBrowserOrigin(origin, env)) {
    return null;
  }

  return json(request, env, { ok: false, reason: "origin forbidden" }, 403);
}

function rejectBadDrainAuth(request: Request, env: Env): Response | null {
  const authorization = request.headers.get("Authorization");

  if (authorization === `Bearer ${env.DRAIN_TOKEN}`) {
    return null;
  }

  return json(request, env, { ok: false, reason: "unauthorized" }, 401);
}

function isAllowedBrowserOrigin(origin: string, env: Env): boolean {
  return origin === env.DASHBOARD_ORIGIN || localOrigins.has(origin);
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function rawJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function isPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") {
    return false;
  }

  const subscription = value as Partial<PushSubscription>;

  return (
    typeof subscription.endpoint === "string" &&
    typeof subscription.keys?.p256dh === "string" &&
    typeof subscription.keys.auth === "string"
  );
}

function validateSymptom(
  input: unknown
):
  | {
      ok: true;
      value: Omit<SymptomRecord, "ts" | "id">;
    }
  | { ok: false; reason: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "body must be an object" };
  }

  const value = input as Record<string, unknown>;

  if (typeof value.category !== "string" || !allowedCategories.has(value.category)) {
    return { ok: false, reason: "invalid category" };
  }

  if (
    typeof value.severity !== "number" ||
    !Number.isInteger(value.severity) ||
    value.severity < 0 ||
    value.severity > 5
  ) {
    return { ok: false, reason: "invalid severity" };
  }

  if (typeof value.vomit !== "boolean") {
    return { ok: false, reason: "invalid vomit" };
  }

  if (
    value.note !== null &&
    value.note !== undefined &&
    (typeof value.note !== "string" || value.note.length > 500)
  ) {
    return { ok: false, reason: "invalid note" };
  }

  return {
    ok: true,
    value: {
      category: value.category,
      severity: value.severity,
      vomit: value.vomit,
      note: typeof value.note === "string" ? value.note : null
    }
  };
}

async function pendingSymptoms(env: Env): Promise<(SymptomRecord & { key: string })[]> {
  const values: (SymptomRecord & { key: string })[] = [];
  let cursor: string | undefined;

  do {
    const listed = await env.KV.list({ prefix: "queue:", cursor });
    cursor = listed.cursor;

    for (const key of listed.keys) {
      const raw = await env.KV.get(key.name);

      if (!raw) {
        continue;
      }

      values.push({ key: key.name, ...rawJson<SymptomRecord>(raw) });
    }
  } while (cursor);

  return values.sort((left, right) => left.key.localeCompare(right.key));
}

function randomId(): string {
  return "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
