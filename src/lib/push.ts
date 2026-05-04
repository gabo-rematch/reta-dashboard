type PushResult = { ok: true } | { ok: false; reason: string };

export async function isSupported(): Promise<boolean> {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function getSubscription(): Promise<PushSubscription | null> {
  if (!(await isSupported())) {
    return null;
  }

  const registration = await navigator.serviceWorker.ready;

  return registration.pushManager.getSubscription();
}

export async function enablePush(workerOrigin: string): Promise<PushResult> {
  if (!workerOrigin) {
    return { ok: false, reason: "worker origin missing" };
  }

  if (!(await isSupported())) {
    return { ok: false, reason: "push unsupported" };
  }

  const permission = await Notification.requestPermission();

  if (permission === "denied") {
    return { ok: false, reason: "permission denied" };
  }

  if (permission !== "granted") {
    return { ok: false, reason: "permission not granted" };
  }

  try {
    const keyResponse = await fetch(`${workerOrigin}/vapid-public-key`);

    if (!keyResponse.ok) {
      return {
        ok: false,
        reason: `${keyResponse.status} ${keyResponse.statusText}`.trim()
      };
    }

    const { key } = (await keyResponse.json()) as { key?: string };

    if (!key) {
      return { ok: false, reason: "missing VAPID public key" };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(key) as unknown as BufferSource
    });
    const registerResponse = await fetch(`${workerOrigin}/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON())
    });

    if (!registerResponse.ok) {
      return {
        ok: false,
        reason: `${registerResponse.status} ${registerResponse.statusText}`.trim()
      };
    }

    sessionStorage.setItem("reta:push:enabled", "1");

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "push setup failed"
    };
  }
}

export async function disablePush(workerOrigin: string): Promise<void> {
  const subscription = await getSubscription();

  if (subscription) {
    await subscription.unsubscribe();
  }

  if (workerOrigin) {
    await fetch(`${workerOrigin}/push/unregister`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  }

  sessionStorage.removeItem("reta:push:enabled");
}

export function urlB64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = `${b64}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index++) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}
