import { useEffect, useState } from "react";
import { enablePush, getSubscription, isSupported } from "../lib/push";

type EnableNotificationsProps = {
  workerOrigin: string;
};

type UiState = {
  supported: boolean;
  loading: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  error: string;
};

export function EnableNotifications({ workerOrigin }: EnableNotificationsProps) {
  const [state, setState] = useState<UiState>({
    supported: false,
    loading: true,
    permission: "default",
    subscribed: false,
    error: ""
  });

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const supported = await isSupported();

      if (!supported) {
        if (!cancelled) {
          setState((current) => ({ ...current, supported: false, loading: false }));
        }
        return;
      }

      const subscription = await getSubscription();

      if (!cancelled) {
        setState({
          supported: true,
          loading: false,
          permission: Notification.permission,
          subscribed: subscription !== null,
          error: ""
        });
      }
    }

    void loadState();

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    const result = await enablePush(workerOrigin);

    if (result.ok) {
      setState((current) => ({
        ...current,
        loading: false,
        permission: "granted",
        subscribed: true,
        error: ""
      }));
      return;
    }

    setState((current) => ({
      ...current,
      loading: false,
      permission:
        typeof Notification !== "undefined" ? Notification.permission : current.permission,
      error: result.reason
    }));
  }

  if (!state.supported || state.loading) {
    return null;
  }

  if (state.permission === "denied") {
    return (
      <p className="px-1 text-xs leading-5 text-zinc-500">
        Notifications blocked — re-enable in iOS settings
      </p>
    );
  }

  if (state.permission === "granted" && state.subscribed) {
    return (
      <p className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-center text-xs font-medium text-emerald-300">
        Reminders enabled (daily 19:00 + Sat 18:00)
      </p>
    );
  }

  const label =
    state.permission === "granted" && !state.subscribed
      ? "Restore reminders"
      : "Enable daily reminders";

  return (
    <div className="space-y-2 text-center">
      <button
        className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
        onClick={enable}
        type="button"
      >
        {label}
      </button>
      {state.error ? (
        <p className="text-xs leading-5 text-red-300">{state.error}</p>
      ) : null}
    </div>
  );
}
