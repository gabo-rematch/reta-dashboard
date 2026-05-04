import { EmptyState } from "./EmptyState";
import { formatDose, relativeTime } from "../lib/format";
import type { Injection, ProtocolState } from "../lib/types";
import type { DoseCountdown } from "../lib/state";

type HeroProps = {
  protocolState: ProtocolState | undefined;
  currentWeek: number;
  lastInjection: Injection | undefined;
  countdown: DoseCountdown;
  now: Date;
};

export function Hero({
  protocolState,
  currentWeek,
  lastInjection,
  countdown,
  now
}: HeroProps) {
  if (!protocolState) {
    return <EmptyState />;
  }

  return (
    <section className="rounded-lg border border-amber-400/30 bg-zinc-900 p-6 shadow-[0_0_0_1px_rgba(251,191,36,0.08)] dark:border-amber-400/30 dark:bg-zinc-900">
      <p className="text-sm font-medium uppercase tracking-normal text-zinc-400">
        Week {currentWeek} · Step {protocolState.current_step}
      </p>
      <h1 className="mt-5 text-[64px] font-semibold leading-none tracking-normal text-zinc-50 tabular-nums">
        {formatDose(protocolState.current_dose_mg)} mg
      </h1>
      <p className="mt-3 text-base text-zinc-400 tabular-nums">
        {lastInjection?.clicks ?? 0} clicks
      </p>
      <div className="mt-8 space-y-2 border-t border-zinc-800 pt-5 text-base leading-6 text-zinc-300">
        <p>
          <span className="text-zinc-500">Last:</span>{" "}
          {lastInjection ? relativeTime(lastInjection.ts, now) : "none yet"}
        </p>
        <p>
          <span className="text-zinc-500">Next:</span> {countdown.friendly}
        </p>
      </div>
    </section>
  );
}
