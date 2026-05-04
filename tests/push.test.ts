import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disablePush,
  enablePush,
  getSubscription,
  isSupported,
  urlB64ToUint8Array
} from "../src/lib/push";

describe("push helpers", () => {
  afterEach(() => {
    sessionStorage.clear();
    Reflect.deleteProperty(window, "Notification");
    Reflect.deleteProperty(globalThis, "Notification");
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(globalThis, "PushManager");
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    vi.unstubAllGlobals();
  });

  it("reports support only when notification, service worker, and push APIs exist", async () => {
    expect(await isSupported()).toBe(false);

    installPushEnvironment({ permission: "default" });

    expect(await isSupported()).toBe(true);
  });

  it("enables push reminders and registers the subscription with the worker", async () => {
    const subscription = makeSubscription();
    const subscribe = vi.fn().mockResolvedValue(subscription);
    const requestPermission = vi.fn().mockResolvedValue("granted");
    installPushEnvironment({
      permission: "default",
      requestPermission,
      subscribe
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: "BAECAwQFBgc" })
      })
      .mockResolvedValueOnce({
        ok: true,
        statusText: "OK"
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: true
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array("BAECAwQFBgc")
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://worker.example/push/register",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      })
    );
    expect(sessionStorage.getItem("reta:push:enabled")).toBe("1");
  });

  it("does not subscribe when notification permission is denied", async () => {
    const subscribe = vi.fn();
    installPushEnvironment({
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("denied"),
      subscribe
    });

    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: false,
      reason: "permission denied"
    });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("does not subscribe when notification permission remains undecided", async () => {
    const subscribe = vi.fn();
    installPushEnvironment({
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("default"),
      subscribe
    });

    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: false,
      reason: "permission not granted"
    });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("fails before requesting permission when no worker origin is configured", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    installPushEnvironment({ permission: "default", requestPermission });

    await expect(enablePush("")).resolves.toEqual({
      ok: false,
      reason: "worker origin missing"
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports unsupported browsers before subscribing", async () => {
    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: false,
      reason: "push unsupported"
    });
    await expect(getSubscription()).resolves.toBeNull();
  });

  it("returns worker failures from the VAPID key request", async () => {
    installPushEnvironment({
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted")
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Unavailable"
      })
    );

    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: false,
      reason: "503 Unavailable"
    });
  });

  it("requires a VAPID public key from the worker", async () => {
    installPushEnvironment({
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted")
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      })
    );

    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: false,
      reason: "missing VAPID public key"
    });
  });

  it("returns worker failures from push registration", async () => {
    installPushEnvironment({
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted")
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ key: "BAECAwQFBgc" })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Register Failed"
        })
    );

    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: false,
      reason: "500 Register Failed"
    });
  });

  it("returns setup exceptions as failure reasons", async () => {
    installPushEnvironment({
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted")
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(enablePush("https://worker.example")).resolves.toEqual({
      ok: false,
      reason: "offline"
    });
  });

  it("returns the current subscription and can unregister it", async () => {
    const subscription = makeSubscription();
    const unsubscribe = vi.fn().mockResolvedValue(true);
    subscription.unsubscribe = unsubscribe;
    installPushEnvironment({ permission: "granted", subscription });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK"
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSubscription()).resolves.toBe(subscription);
    await disablePush("https://worker.example");

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example/push/unregister",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
    );
    expect(sessionStorage.getItem("reta:push:enabled")).toBeNull();
  });

  it("can disable push when no subscription or worker origin exists", async () => {
    installPushEnvironment({ permission: "granted", subscription: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await disablePush("");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

type PushEnvironmentOptions = {
  permission: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
  subscribe?: (options: PushSubscriptionOptionsInit) => Promise<PushSubscription>;
  subscription?: PushSubscription | null;
};

function installPushEnvironment(options: PushEnvironmentOptions): void {
  const subscription = options.subscription ?? null;
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscription),
    subscribe:
      options.subscribe ??
      vi.fn().mockResolvedValue(subscription ?? makeSubscription())
  };
  const serviceWorker = {
    ready: Promise.resolve({ pushManager })
  };
  const notification = {
    permission: options.permission,
    requestPermission:
      options.requestPermission ??
      vi.fn().mockResolvedValue(options.permission)
  };

  Object.defineProperty(window, "Notification", {
    value: notification,
    configurable: true
  });
  Object.defineProperty(globalThis, "Notification", {
    value: notification,
    configurable: true
  });
  Object.defineProperty(window, "PushManager", {
    value: function PushManager() {},
    configurable: true
  });
  Object.defineProperty(globalThis, "PushManager", {
    value: function PushManager() {},
    configurable: true
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: serviceWorker,
    configurable: true
  });
}

function makeSubscription(): PushSubscription {
  return {
    endpoint: "https://push.example/send/1",
    expirationTime: null,
    getKey: () => null,
    options: { userVisibleOnly: true },
    toJSON: () => ({
      endpoint: "https://push.example/send/1",
      keys: {
        p256dh: "p256dh",
        auth: "auth"
      }
    }),
    unsubscribe: vi.fn().mockResolvedValue(true)
  } as unknown as PushSubscription;
}
