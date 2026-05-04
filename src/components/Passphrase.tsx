import { FormEvent, useState } from "react";

type PassphraseProps = {
  failed?: boolean;
  disabled?: boolean;
  onSubmit: (passphrase: string, remember: boolean) => void;
};

export function Passphrase({
  failed = false,
  disabled = false,
  onSubmit
}: PassphraseProps) {
  const [passphrase, setPassphrase] = useState("");
  const [remember, setRemember] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (passphrase.length === 0 || disabled) {
      return;
    }

    onSubmit(passphrase, remember);
  }

  return (
    <form
      className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
      onSubmit={handleSubmit}
    >
      {failed ? (
        <p className="mb-2 text-sm font-medium text-red-300">wrong passphrase</p>
      ) : null}

      <label
        className="block text-sm font-medium uppercase tracking-normal text-zinc-400"
        htmlFor="passphrase"
      >
        Passphrase
      </label>
      <input
        autoComplete="off"
        autoFocus
        className="mt-3 min-h-14 w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 text-lg text-zinc-50 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        enterKeyHint="go"
        id="passphrase"
        inputMode="text"
        onChange={(event) => setPassphrase(event.target.value)}
        spellCheck={false}
        type="password"
        value={passphrase}
      />

      <label className="mt-4 flex items-center gap-3 text-sm text-zinc-300">
        <input
          checked={remember}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-amber-300"
          disabled={disabled}
          onChange={(event) => setRemember(event.target.checked)}
          type="checkbox"
        />
        <span>remember on this device</span>
      </label>

      <button
        className="mt-5 min-h-12 w-full rounded-md bg-amber-300 px-4 text-base font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled || passphrase.length === 0}
        type="submit"
      >
        Unlock
      </button>
    </form>
  );
}
