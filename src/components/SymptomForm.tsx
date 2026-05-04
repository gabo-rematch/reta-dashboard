import { useState } from "react";
import type { FormEvent } from "react";
import { logSymptom } from "../lib/symptom";
import type { SymptomInput } from "../lib/symptom";

type SymptomFormProps = {
  workerOrigin: string;
};

const categories = [
  ["gi", "GI"],
  ["dysesthesia", "Dysesthesia"],
  ["hr", "Heart rate"],
  ["sleep", "Sleep"],
  ["injection-site", "Injection site"],
  ["other", "Other"]
] as const;

const initialInput: SymptomInput = {
  category: "gi",
  severity: 0,
  vomit: false,
  note: null
};

export function SymptomForm({ workerOrigin }: SymptomFormProps) {
  const [input, setInput] = useState<SymptomInput>(initialInput);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    const result = await logSymptom(workerOrigin, {
      ...input,
      note: note.trim() ? note.trim() : null
    });

    if (result.ok) {
      setInput(initialInput);
      setNote("");
      setStatus("success");
      setMessage("✓ logged · syncs to your Mac within 15 min");
      return;
    }

    setStatus("error");
    setMessage(result.reason);
  }

  function updateInput(patch: Partial<SymptomInput>) {
    setInput((current) => ({ ...current, ...patch }));
    if (status !== "saving") {
      setStatus("idle");
      setMessage("");
    }
  }

  const saving = status === "saving";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-sm dark:bg-zinc-900">
      <form className="space-y-4" onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-zinc-300">Symptom log</h2>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Queue a private entry for the Mac sync job.
            </p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-normal text-amber-300 ring-1 ring-amber-400/20">
            today
          </span>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-zinc-400">Category</span>
          <select
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            disabled={saving}
            onChange={(event) => updateInput({ category: event.target.value })}
            value={input.category}
          >
            {categories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-sm font-medium text-zinc-400">Severity</span>
          <div className="mt-2 grid grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
            <button
              aria-label="decrease severity"
              className="h-11 border-r border-zinc-800 text-xl text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-700"
              disabled={saving || input.severity === 0}
              onClick={() =>
                updateInput({ severity: Math.max(0, input.severity - 1) })
              }
              type="button"
            >
              -
            </button>
            <div className="text-center text-base font-semibold text-zinc-100">
              {input.severity}
              <span className="ml-1 text-sm font-normal text-zinc-500">/ 5</span>
            </div>
            <button
              aria-label="increase severity"
              className="h-11 border-l border-zinc-800 text-xl text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-700"
              disabled={saving || input.severity === 5}
              onClick={() =>
                updateInput({ severity: Math.min(5, input.severity + 1) })
              }
              type="button"
            >
              +
            </button>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-zinc-300">
          <input
            checked={input.vomit}
            className="h-4 w-4 accent-amber-500"
            disabled={saving}
            onChange={(event) => updateInput({ vomit: event.target.checked })}
            type="checkbox"
          />
          Vomit
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-400">Note</span>
          <input
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
            disabled={saving}
            maxLength={500}
            onChange={(event) => {
              setNote(event.target.value);
              if (status !== "saving") {
                setStatus("idle");
                setMessage("");
              }
            }}
            placeholder="optional"
            value={note}
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
            {saving ? "Logging" : "Log"}
          </button>
        </div>
      </form>
    </section>
  );
}
