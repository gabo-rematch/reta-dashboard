import type { Hold } from "../lib/state";

type HoldsCardProps = {
  holds: Hold[];
};

const pillClasses: Record<Hold["source"], string> = {
  vomit: "bg-red-500/10 text-red-300 ring-red-400/20",
  severity: "bg-amber-500/10 text-amber-300 ring-amber-400/20",
  manual: "bg-blue-500/10 text-blue-300 ring-blue-400/20"
};

export function HoldsCard({ holds }: HoldsCardProps) {
  if (holds.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-sm dark:bg-zinc-900">
      <h2 className="text-base font-medium text-zinc-300">Active holds</h2>
      <div className="mt-4 space-y-3">
        {holds.map((hold) => (
          <div key={hold.source} className="flex items-start gap-3">
            <span
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-normal ring-1",
                pillClasses[hold.source]
              ].join(" ")}
            >
              {hold.name}
            </span>
            <p className="min-w-0 flex-1 text-base leading-6 text-zinc-300">
              {hold.reason}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
