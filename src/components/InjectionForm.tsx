import { useState } from "react";
import type { FormEvent } from "react";
import { formatDose } from "../lib/format";
import { logInjection } from "../lib/injection";
import type { InjectionInput } from "../lib/injection";

type InjectionFormProps = {
  defaultClicks: number;
  workerOrigin: string;
};

const sites = [
  ["", "None"],
  ["abdomen", "Abdomen"],
  ["thigh", "Thigh"],
  ["arm", "Arm"]
] as const;

export function InjectionForm({
  defaultClicks,
  workerOrigin
}: InjectionFormProps) {
  const [clicks, setClicks] = useState(Math.max(1, defaultClicks));
  const [site, setSite] = useState<InjectionInput["site"]>(null);
  const [notes, setNotes] = useState("");
  const [preserveSchedule, setPreserveSchedule] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const saving = status === "saving";
  const doseMg = clicks / 10;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    const result = await logInjection(workerOrigin, {
      clicks,
      site,
      notes: notes.trim() ? notes.trim() : null,
      preserveSchedule
    });

    if (result.ok) {
      setNotes("");
      setStatus("success");
      setMessage("✓ logged · syncs to your Mac within 15 min");
      return;
    }

    setStatus("error");
    setMessage(result.reason);
  }

  function resetMessage() {
    if (status !== "saving") {
      setStatus("idle");
      setMessage("");
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-sm dark:bg-zinc-900">
      <form className="space-y-4" onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-zinc-300">Injection log</h2>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              {formatDose(doseMg)} mg · {clicks} clicks
            </p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-normal text-amber-300 ring-1 ring-amber-400/20">
            now
          </span>
        </div>

        <div>
          <span className="text-sm font-medium text-zinc-400">Clicks</span>
          <div className="mt-2 grid grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
            <button
              aria-label="decrease clicks"
              className="h-11 border-r border-zinc-800 text-xl text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-700"
              disabled={saving || clicks === 1}
              onClick={() => {
                setClicks((current) => Math.max(1, current - 1));
                resetMessage();
              }}
              type="button"
            >
              -
            </button>
            <div className="text-center text-base font-semibold text-zinc-100">
              {clicks}
              <span className="ml-1 text-sm font-normal text-zinc-500">
                clicks
              </span>
            </div>
            <button
              aria-label="increase clicks"
              className="h-11 border-l border-zinc-800 text-xl text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-700"
              disabled={saving}
              onClick={() => {
                setClicks((current) => current + 1);
                resetMessage();
              }}
              type="button"
            >
              +
            </button>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-zinc-400">Site</span>
          <select
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            disabled={saving}
            onChange={(event) => {
              setSite(event.target.value || null);
              resetMessage();
            }}
            value={site ?? ""}
          >
            {sites.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-zinc-300">
          <input
            checked={preserveSchedule}
            className="h-4 w-4 accent-amber-500"
            disabled={saving}
            onChange={(event) => {
              setPreserveSchedule(event.target.checked);
              resetMessage();
            }}
            type="checkbox"
          />
          Keep schedule
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-400">Notes</span>
          <input
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            disabled={saving}
            maxLength={500}
            onChange={(event) => {
              setNotes(event.target.value);
              resetMessage();
            }}
            placeholder="optional"
            value={notes}
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <p
            className={[
              "min-h-5 flex-1 text-sm",
              status === "success" ? "text-emerald-300" : "text-red-300"
            ].join(" ")}
            role={status === "error" ? "alert" : undefined}
          >
            {message}
          </p>
          <button
            className="h-10 rounded-md bg-amber-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            disabled={saving}
            type="submit"
          >
            {saving ? "Logging" : "Log injection"}
          </button>
        </div>
      </form>
    </section>
  );
}
