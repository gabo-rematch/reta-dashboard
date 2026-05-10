import { sendWebPush } from "./push";
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import type { PushSubscription } from "./push";

export type Env = {
  KV: KVNamespace;
  DASHBOARD_ORIGIN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  DRAIN_TOKEN: string;
  DASHBOARD_PASSPHRASE: string;
  SAT_EMAIL: SendEmail;
};

type SymptomRecord = {
  ts: string;
  id: string;
  category: string;
  severity: number;
  vomit: boolean;
  note: string | null;
};

type InjectionRecord = {
  ts: string;
  id: string;
  clicks: number;
  dose_mg: number;
  site: string | null;
  notes: string | null;
  preserve_schedule: boolean;
};

type PushSender = typeof sendWebPush;
type ScheduledInput = Pick<ScheduledController, "cron">;

const allowedCategories = new Set([
  "gi",
  "dysesthesia",
  "hr",
  "sleep",
  "injection-site",
  "other"
]);
const allowedInjectionSites = new Set(["abdomen", "thigh", "arm"]);
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

  if (request.method === "POST" && url.pathname === "/injection") {
    const forbidden = rejectBadBrowserOrigin(request, env);
    if (forbidden) {
      return forbidden;
    }

    const input = await readJson<unknown>(request);
    const validation = validateInjection(input);

    if (!validation.ok) {
      return json(request, env, { ok: false, reason: validation.reason }, 400);
    }

    const ts = new Date().toISOString();
    const id = randomId();
    const record: InjectionRecord = { ts, id, ...validation.value };
    const key = `injection-queue:${ts}:${id}`;
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

  if (request.method === "GET" && url.pathname === "/injection/pending") {
    const unauthorized = rejectBadDrainAuth(request, env);
    if (unauthorized) {
      return unauthorized;
    }

    const items = await pendingInjections(env);

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

  if (
    request.method === "DELETE" &&
    url.pathname.startsWith("/injection/pending/")
  ) {
    const unauthorized = rejectBadDrainAuth(request, env);
    if (unauthorized) {
      return unauthorized;
    }

    const key = decodeURIComponent(
      url.pathname.slice("/injection/pending/".length)
    );

    if (!key.startsWith("injection-queue:")) {
      return json(request, env, { ok: false, reason: "invalid queue key" }, 400);
    }

    await env.KV.delete(key);

    return json(request, env, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/admin/test-saturday-email") {
    const unauthorized = rejectBadDrainAuth(request, env);
    if (unauthorized) return unauthorized;
    await sendSaturdayBriefEmail(env);
    return json(request, env, { ok: true, kind: "saturday-email" });
  }

  if (request.method === "POST" && url.pathname === "/admin/test-push") {
    const unauthorized = rejectBadDrainAuth(request, env);
    if (unauthorized) return unauthorized;

    let kind: "daily" | "saturday" = "daily";
    try {
      const body = await request.json<{ kind?: string }>();
      if (body && (body.kind === "saturday" || body.kind === "daily")) {
        kind = body.kind;
      }
    } catch {}

    const cron = kind === "saturday" ? "0 14 * * 6" : "0 15 * * *";
    const fakeEvent = { cron, scheduledTime: Date.now(), type: "scheduled" } as unknown as ScheduledEvent;
    const pending: Promise<unknown>[] = [];
    const fakeCtx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } } as unknown as ExecutionContext;
    await handleScheduled(fakeEvent, env, fakeCtx);
    // Actually await the push send so we can see and surface the outcome
    let pushResult: unknown = null;
    try {
      const settled = await Promise.allSettled(pending);
      pushResult = settled.map(r => r.status === "fulfilled" ? "ok" : `error: ${(r as PromiseRejectedResult).reason?.message ?? r.reason}`);
    } catch (err) {
      pushResult = `unexpected: ${(err as Error).message}`;
    }
    console.log("admin/test-push fired", { kind, cron, pushResult });
    return json(request, env, { ok: true, kind, cron, pushResult });
  }

  return json(request, env, { ok: false, reason: "not found" }, 404);
}

export async function handleScheduled(
  event: ScheduledInput,
  env: Env,
  ctx: ExecutionContext,
  sender: PushSender = sendWebPush
): Promise<void> {
  // Saturday email-brief cron — separate path, no push subscription needed
  if (event.cron === "7 10 * * 6") {
    ctx.waitUntil(sendSaturdayBriefEmail(env));
    return;
  }

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

function validateInjection(
  input: unknown
):
  | {
      ok: true;
      value: Omit<InjectionRecord, "ts" | "id">;
    }
  | { ok: false; reason: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "body must be an object" };
  }

  const value = input as Record<string, unknown>;

  if (
    typeof value.clicks !== "number" ||
    !Number.isInteger(value.clicks) ||
    value.clicks <= 0 ||
    value.clicks > 100
  ) {
    return { ok: false, reason: "invalid clicks" };
  }

  if (
    value.site !== null &&
    value.site !== undefined &&
    (typeof value.site !== "string" || !allowedInjectionSites.has(value.site))
  ) {
    return { ok: false, reason: "invalid site" };
  }

  if (
    value.notes !== null &&
    value.notes !== undefined &&
    (typeof value.notes !== "string" || value.notes.length > 500)
  ) {
    return { ok: false, reason: "invalid notes" };
  }

  if (typeof value.preserveSchedule !== "boolean") {
    return { ok: false, reason: "invalid preserveSchedule" };
  }

  return {
    ok: true,
    value: {
      clicks: value.clicks,
      dose_mg: Math.round(value.clicks * 10) / 100,
      site: typeof value.site === "string" ? value.site : null,
      notes: typeof value.notes === "string" ? value.notes : null,
      preserve_schedule: value.preserveSchedule
    }
  };
}

async function pendingSymptoms(env: Env): Promise<(SymptomRecord & { key: string })[]> {
  const values: (SymptomRecord & { key: string })[] = [];
  let cursor: string | undefined;

  do {
    const listed = await env.KV.list({ prefix: "queue:", cursor });
    cursor = listed.list_complete ? undefined : listed.cursor;

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

async function pendingInjections(
  env: Env
): Promise<(InjectionRecord & { key: string })[]> {
  const values: (InjectionRecord & { key: string })[] = [];
  let cursor: string | undefined;

  do {
    const listed = await env.KV.list({ prefix: "injection-queue:", cursor });
    cursor = listed.list_complete ? undefined : listed.cursor;

    for (const key of listed.keys) {
      const raw = await env.KV.get(key.name);

      if (!raw) {
        continue;
      }

      values.push({ key: key.name, ...rawJson<InjectionRecord>(raw) });
    }
  } while (cursor);

  return values.sort((left, right) => left.key.localeCompare(right.key));
}

function randomId(): string {
  return "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ============================================================
// Saturday brief email (Cloudflare Email Workers via SAT_EMAIL)
// ============================================================

async function sendSaturdayBriefEmail(env: Env): Promise<void> {
  try {
    const url = `${env.DASHBOARD_ORIGIN}/reta-dashboard/data/reta.enc.json`;
    const res = await fetch(url, { cf: { cacheTtl: 0 } });
    if (!res.ok) throw new Error(`fetch reta.enc.json: HTTP ${res.status}`);
    const envelope = (await res.json()) as { v: number; kdf: string; iter: number; salt: string; iv: string; ct: string };
    if (envelope.v !== 1 || envelope.kdf !== "pbkdf2-sha256") {
      throw new Error(`unsupported envelope ${envelope.v}/${envelope.kdf}`);
    }
    const data = await decryptDashboardSnapshot(envelope, env.DASHBOARD_PASSPHRASE);
    const brief = computeBrief(data);

    const msg = createMimeMessage();
    msg.setSender({ name: "reta", addr: "reta@gabodecuba.com" });
    msg.setRecipient("ggl245@nyu.edu");
    msg.setSubject(brief.subject);
    msg.addMessage({ contentType: "text/html", data: brief.html });

    const email = new EmailMessage("reta@gabodecuba.com", "ggl245@nyu.edu", msg.asRaw());
    await env.SAT_EMAIL.send(email);
    console.log("saturday brief sent", { subject: brief.subject });
  } catch (err) {
    const reason = (err as Error).message ?? String(err);
    console.log("saturday brief failed:", reason);
    try {
      const msg = createMimeMessage();
      msg.setSender({ name: "reta", addr: "reta@gabodecuba.com" });
      msg.setRecipient("ggl245@nyu.edu");
      msg.setSubject(`reta brief failed - ${new Date().toISOString().slice(0, 10)}`);
      msg.addMessage({ contentType: "text/plain", data: `reta saturday brief failed: ${reason}` });
      const email = new EmailMessage("reta@gabodecuba.com", "ggl245@nyu.edu", msg.asRaw());
      await env.SAT_EMAIL.send(email);
    } catch (sendErr) {
      console.log("fallback email also failed:", (sendErr as Error).message);
    }
  }
}

function b64ud(s: string): Uint8Array<ArrayBuffer> {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptDashboardSnapshot(env: { iter: number; salt: string; iv: string; ct: string }, passphrase: string): Promise<RetaSnapshot> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", new Uint8Array(enc.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ud(env.salt), iterations: env.iter, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ud(env.iv) }, key, b64ud(env.ct));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

interface RetaSnapshot {
  pens: Array<{ id: number; mg_remaining: number; is_active: number }>;
  injections: Array<{ ts: string; dose_mg: number; clicks: number; site: string | null }>;
  symptoms: Array<{ ts: string; category: string; severity: number; vomit: number; note: string | null }>;
  daily_vitals: Array<{ date: string; rhr: number | null; hrv: number | null }>;
  protocol_state: Array<{ current_week: number; current_step: number; current_dose_mg: number; next_dose_due: string | null; escalation_locked_until_week: number | null; started_on: string | null }>;
}

function computeBrief(data: RetaSnapshot): { subject: string; html: string } {
  const state = data.protocol_state[0];
  if (!state) {
    return {
      subject: "reta brief - no protocol state",
      html: "<p>No protocol state yet. Log your first injection via <code>reta log injection</code>.</p>"
    };
  }

  const now = new Date();
  const dubai = new Date(now.getTime() + 4 * 3600 * 1000);
  const startedOn = state.started_on ? new Date(state.started_on + "T00:00:00Z") : dubai;
  const liveWeek = Math.max(1, Math.floor((dubai.getTime() - startedOn.getTime()) / 86400000 / 7) + 1);
  const dose = state.current_dose_mg;
  const clicks = Math.round(dose / 0.1);
  const step = state.current_step;
  const nextDoseDue = state.next_dose_due ? new Date(state.next_dose_due) : null;
  const dueLocal = nextDoseDue ? new Date(nextDoseDue.getTime() + 4 * 3600 * 1000) : null;
  const dueDeltaH = dueLocal ? (dueLocal.getTime() - dubai.getTime()) / 3600000 : null;
  const countdown = dueDeltaH === null
    ? "unknown"
    : dueDeltaH < 0
      ? `overdue by ${Math.abs(dueDeltaH).toFixed(1)}h`
      : dueDeltaH < 24
        ? `in ${Math.floor(dueDeltaH)}h ${Math.floor((dueDeltaH - Math.floor(dueDeltaH)) * 60)}m`
        : `in ${Math.floor(dueDeltaH / 24)}d ${Math.floor(dueDeltaH % 24)}h`;

  const activePen = data.pens.find(p => p.is_active === 1) ?? data.pens[0];
  const mgRemaining = activePen?.mg_remaining ?? 0;
  const weeksSupply = dose > 0 ? mgRemaining / dose : 0;
  const lowSupply = weeksSupply < 2;

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const recentSymptoms = data.symptoms.filter(s => new Date(s.ts) > sevenDaysAgo);
  const vomitFlag = recentSymptoms.some(s => s.vomit === 1);
  const severityFlag = recentSymptoms.some(s => s.severity >= 4);
  const manualLock = state.escalation_locked_until_week != null && liveWeek <= state.escalation_locked_until_week;
  const blockingHolds = [vomitFlag && "vomit", severityFlag && "severity"].filter(Boolean) as string[];
  const escalateReady = liveWeek >= 4 * step && blockingHolds.length === 0;

  const holdItems: string[] = [];
  if (vomitFlag) holdItems.push("<li>vomit logged in last 7 days</li>");
  if (severityFlag) holdItems.push("<li>severity &ge; 4 in last 7 days</li>");
  if (manualLock) holdItems.push(`<li>manual hold until week ${state.escalation_locked_until_week}</li>`);
  const holdsHtml = holdItems.length ? holdItems.join("") : "<li>no holds active</li>";

  const symptomsHtml = recentSymptoms.length
    ? recentSymptoms.slice(0, 6).map(s => {
        const local = new Date(new Date(s.ts).getTime() + 4 * 3600 * 1000);
        const ts = local.toISOString().slice(0, 16).replace("T", " ");
        const note = s.note ? ` &middot; ${s.note}` : "";
        const vomit = s.vomit === 1 ? " &middot; <b>vomit</b>" : "";
        return `<li>${ts} GST &middot; ${s.category} &middot; severity ${s.severity}${note}${vomit}</li>`;
      }).join("")
    : "<li>none logged</li>";

  const escalateText = escalateReady
    ? `<p>Ready &mdash; run <code>reta escalate</code> to advance to step ${step + 1}.</p>`
    : blockingHolds.length
      ? `<p>Blocked by: ${blockingHolds.join(", ")}.</p>`
      : manualLock
        ? `<p>Manual hold active until week ${state.escalation_locked_until_week}.</p>`
        : `<p>Not yet at next escalate window (need week ${4 * step}, currently week ${liveWeek}).</p>`;

  const dueLine = dueLocal
    ? `<p><b>Next dose:</b> ${dueLocal.toISOString().slice(0, 16).replace("T", " ")} GST (${countdown})</p>`
    : `<p><b>Next dose:</b> not scheduled</p>`;

  const subject = `reta brief - week ${liveWeek} - dose ${countdown}`;
  const html = `<h2>Week ${liveWeek} &middot; Step ${step} &middot; ${dose} mg / ${clicks} clicks</h2>
${dueLine}
<p><b>Pen #${activePen?.id ?? "?"}:</b> ${mgRemaining} mg &middot; ~${weeksSupply.toFixed(1)} weeks at current dose${lowSupply ? ' &middot; <span style="color:#f00;">low supply</span>' : ""}</p>
<h3>Holds</h3>
<ul>${holdsHtml}</ul>
<h3>Escalate readiness</h3>
${escalateText}
<h3>Recent symptoms (last 7d)</h3>
<ul>${symptomsHtml}</ul>
<hr/>
<p style="font-size:11px;color:#666;">Source: <a href="https://gabo-rematch.github.io/reta-dashboard/">dashboard</a> &middot; automated weekly brief.</p>`;

  return { subject, html };
}
