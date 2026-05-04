import {
  injectionSummary,
  relativeTime,
  symptomSummary
} from "../lib/format";
import type { Injection, Symptom } from "../lib/types";

type HistoryProps = {
  injections: Injection[];
  symptoms: Symptom[];
  now: Date;
};

type HistoryRow = {
  id: string;
  ts: string;
  kind: "Injection" | "Symptom";
  summary: string;
};

export function History({ injections, symptoms, now }: HistoryProps) {
  const rows = buildRows(injections, symptoms, now);

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-sm dark:bg-zinc-900">
      <summary className="cursor-pointer list-none text-base font-medium text-zinc-300">
        Recent history
      </summary>
      <div className="mt-4 overflow-x-auto">
        {rows.length > 0 ? (
          <table className="w-full border-collapse text-left text-sm">
            <thead className="text-xs uppercase tracking-normal text-zinc-500">
              <tr>
                <th className="border-b border-zinc-800 pb-2 pr-3 font-medium">
                  When
                </th>
                <th className="border-b border-zinc-800 pb-2 pr-3 font-medium">
                  Kind
                </th>
                <th className="border-b border-zinc-800 pb-2 font-medium">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border-b border-zinc-800 py-3 pr-3 align-top text-zinc-400 tabular-nums">
                    {relativeTime(row.ts, now)}
                  </td>
                  <td className="border-b border-zinc-800 py-3 pr-3 align-top">
                    {row.kind}
                  </td>
                  <td className="border-b border-zinc-800 py-3 align-top">
                    {row.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-base text-zinc-400">No recent entries.</p>
        )}
      </div>
    </details>
  );
}

function buildRows(
  injections: Injection[],
  symptoms: Symptom[],
  now: Date
): HistoryRow[] {
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const injectionRows: HistoryRow[] = injections.map((injection) => ({
    id: `injection-${injection.id}`,
    ts: injection.ts,
    kind: "Injection",
    summary: injectionSummary(injection)
  }));
  const symptomRows: HistoryRow[] = symptoms.map((symptom) => ({
    id: `symptom-${symptom.id}`,
    ts: symptom.ts,
    kind: "Symptom",
    summary: symptomSummary(symptom)
  }));

  return [...injectionRows, ...symptomRows]
    .filter((row) => {
      const time = new Date(row.ts).getTime();
      return time >= cutoff && time <= now.getTime();
    })
    .sort((left, right) => new Date(right.ts).getTime() - new Date(left.ts).getTime());
}
