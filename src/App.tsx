import { useEffect, useMemo, useState } from "react";
import { Hero } from "./components/Hero";
import { HoldsCard } from "./components/HoldsCard";
import { History } from "./components/History";
import { InjectionForm } from "./components/InjectionForm";
import { Passphrase } from "./components/Passphrase";
import { PenCard } from "./components/PenCard";
import { EnableNotifications } from "./components/EnableNotifications";
import { SymptomForm } from "./components/SymptomForm";
import { DecryptError, decryptEnvelope } from "./lib/crypto";
import type { Envelope } from "./lib/crypto";
import {
  clearPassphrase,
  getPassphrase,
  setPassphrase
} from "./lib/passphraseStore";
import {
  activeHolds,
  currentWeek,
  nextDoseCountdown,
  weeksOfSupply
} from "./lib/state";
import type { RetaSnapshot } from "./lib/types";

const PROJECT_TZ = "Asia/Dubai";
const WORKER_ORIGIN = import.meta.env.VITE_WORKER_ORIGIN ?? "";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "locked";
      envelope: Envelope;
      failed: boolean;
      decrypting: boolean;
    }
  | { status: "ready"; snapshot: RetaSnapshot };

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}data/reta.enc.json`
        );

        if (!response.ok) {
          throw new Error(`Could not load reta.enc.json (${response.status})`);
        }

        const envelope = (await response.json()) as Envelope;
        const storedPassphrase = getPassphrase();

        if (!storedPassphrase) {
          if (!cancelled) {
            setLoadState({
              status: "locked",
              envelope,
              failed: false,
              decrypting: false
            });
          }

          return;
        }

        try {
          const snapshot = await decryptSnapshot(envelope, storedPassphrase);

          if (!cancelled) {
            setLoadState({ status: "ready", snapshot });
          }
        } catch (error) {
          clearPassphrase();

          if (!cancelled) {
            if (error instanceof DecryptError) {
              setLoadState({
                status: "locked",
                envelope,
                failed: true,
                decrypting: false
              });
            } else {
              setLoadState({
                status: "error",
                message: "Could not read decrypted dashboard data"
              });
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not load reta.enc.json"
          });
        }
      }
    }

    void loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePassphraseSubmit(passphrase: string, remember: boolean) {
    if (loadState.status !== "locked") {
      return;
    }

    const envelope = loadState.envelope;
    setLoadState({ ...loadState, failed: false, decrypting: true });

    try {
      const snapshot = await decryptSnapshot(envelope, passphrase);

      setPassphrase(passphrase, remember);
      setLoadState({ status: "ready", snapshot });
    } catch (error) {
      clearPassphrase();

      if (error instanceof DecryptError) {
        setLoadState({
          status: "locked",
          envelope,
          failed: true,
          decrypting: false
        });
      } else {
        setLoadState({
          status: "error",
          message: "Could not read decrypted dashboard data"
        });
      }
    }
  }

  function lockDashboard() {
    clearPassphrase();
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        {loadState.status === "loading" ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
            loading
          </div>
        ) : null}

        {loadState.status === "error" ? (
          <div className="rounded-lg border border-red-400/40 bg-red-950/40 p-5 text-base leading-6 text-red-100">
            {loadState.message}
          </div>
        ) : null}

        {loadState.status === "locked" ? (
          <Passphrase
            disabled={loadState.decrypting}
            failed={loadState.failed}
            onSubmit={handlePassphraseSubmit}
          />
        ) : null}

        {loadState.status === "ready" ? (
          <>
            <Dashboard snapshot={loadState.snapshot} now={now} />
            <footer className="pb-2 text-center text-sm">
              <button
                className="text-zinc-500 underline decoration-zinc-700 underline-offset-4 transition hover:text-zinc-300"
                onClick={lockDashboard}
                type="button"
              >
                lock
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </main>
  );
}

async function decryptSnapshot(
  envelope: Envelope,
  passphrase: string
): Promise<RetaSnapshot> {
  const plaintext = await decryptEnvelope(envelope, passphrase);

  return JSON.parse(plaintext) as RetaSnapshot;
}

function Dashboard({ snapshot, now }: { snapshot: RetaSnapshot; now: Date }) {
  const protocolState = snapshot.protocol_state[0];
  const week = protocolState
    ? currentWeek(protocolState.started_on, now, PROJECT_TZ)
    : 1;
  const lastInjection = [...snapshot.injections].sort(
    (left, right) => new Date(right.ts).getTime() - new Date(left.ts).getTime()
  )[0];
  const activePen =
    snapshot.pens.find((pen) => pen.is_active === 1) ?? snapshot.pens[0];
  const currentDoseMg = protocolState?.current_dose_mg ?? lastInjection?.dose_mg ?? 0;
  const currentClicks = Math.max(1, Math.round(currentDoseMg / 0.1));
  const supply = weeksOfSupply(activePen, currentDoseMg);
  const holds = activeHolds(snapshot.symptoms, protocolState, week, now);
  const countdown = nextDoseCountdown(protocolState, now);

  return (
    <>
      <Hero
        protocolState={protocolState}
        currentWeek={week}
        lastInjection={lastInjection}
        countdown={countdown}
        now={now}
      />
      <PenCard supply={supply} />
      <InjectionForm defaultClicks={currentClicks} workerOrigin={WORKER_ORIGIN} />
      <SymptomForm workerOrigin={WORKER_ORIGIN} />
      <HoldsCard holds={holds} />
      <History
        injections={snapshot.injections}
        symptoms={snapshot.symptoms}
        now={now}
      />
      <EnableNotifications workerOrigin={WORKER_ORIGIN} />
    </>
  );
}
