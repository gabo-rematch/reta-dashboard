import { formatDose } from "../lib/format";
import type { SupplyEstimate } from "../lib/state";

type PenCardProps = {
  supply: SupplyEstimate;
};

export function PenCard({ supply }: PenCardProps) {
  return (
    <section
      className={[
        "rounded-lg border bg-zinc-900 p-5 shadow-sm dark:bg-zinc-900",
        supply.low
          ? "border-red-400/50 ring-1 ring-red-400/30"
          : "border-zinc-800"
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-medium text-zinc-300">Active pen</h2>
        {supply.low ? (
          <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-normal text-red-300">
            Low supply
          </span>
        ) : null}
      </div>
      <p
        className={[
          "mt-4 text-4xl font-semibold leading-tight tabular-nums",
          supply.low ? "text-red-200" : "text-zinc-50"
        ].join(" ")}
      >
        {formatDose(supply.mgRemaining)} mg remaining
      </p>
      <p className="mt-2 text-base text-zinc-400 tabular-nums">
        ~{formatDose(supply.weeks)} weeks at current dose
      </p>
    </section>
  );
}
