import type { Pen, ProtocolState, Symptom } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type Hold = {
  source: "vomit" | "severity" | "manual";
  name: string;
  reason: string;
};

export type DoseCountdown = {
  dueAt: Date | null;
  dueInMs: number | null;
  overdueMs: number | null;
  friendly: string;
};

export type SupplyEstimate = {
  mgRemaining: number;
  weeks: number;
  low: boolean;
};

export function currentWeek(startedOn: string, now: Date, tz: string): number {
  const elapsedDays =
    dateKeyToDayNumber(dateKeyInTimeZone(now, tz)) -
    dateKeyToDayNumber(startedOn);
  return Math.max(1, Math.floor(elapsedDays / 7) + 1);
}

export function nextDoseCountdown(
  state: ProtocolState | undefined,
  now: Date
): DoseCountdown {
  if (!state?.next_dose_due) {
    return {
      dueAt: null,
      dueInMs: null,
      overdueMs: null,
      friendly: "no dose scheduled"
    };
  }

  const dueAt = new Date(state.next_dose_due);
  const deltaMs = dueAt.getTime() - now.getTime();

  if (deltaMs < 0) {
    const overdueMs = Math.abs(deltaMs);
    return {
      dueAt,
      dueInMs: null,
      overdueMs,
      friendly: `overdue by ${formatDaysHours(overdueMs)}`
    };
  }

  return {
    dueAt,
    dueInMs: deltaMs,
    overdueMs: null,
    friendly: `due in ${formatDueDuration(deltaMs)}`
  };
}

export function weeksOfSupply(
  activePen: Pen | undefined,
  currentDoseMg: number
): SupplyEstimate {
  const mgRemaining = activePen?.mg_remaining ?? 0;
  const weeks = currentDoseMg > 0 ? mgRemaining / currentDoseMg : 0;

  return {
    mgRemaining,
    weeks,
    low: weeks < 2
  };
}

export function activeHolds(
  symptoms: Symptom[],
  state: ProtocolState | undefined,
  currentWeek: number,
  now: Date
): Hold[] {
  const windowStart = now.getTime() - 7 * DAY_MS;
  const recentSymptoms = symptoms.filter((symptom) => {
    const symptomTime = new Date(symptom.ts).getTime();
    return symptomTime >= windowStart && symptomTime <= now.getTime();
  });

  const holds: Hold[] = [];

  if (recentSymptoms.some((symptom) => symptom.vomit === 1)) {
    holds.push({
      source: "vomit",
      name: "Vomiting",
      reason: "Vomiting logged in the last 7 days"
    });
  }

  if (recentSymptoms.some((symptom) => symptom.severity >= 4)) {
    holds.push({
      source: "severity",
      name: "High severity",
      reason: "Symptom severity 4+ logged in the last 7 days"
    });
  }

  if (
    state?.escalation_locked_until_week != null &&
    currentWeek <= state.escalation_locked_until_week
  ) {
    holds.push({
      source: "manual",
      name: "Manual hold",
      reason: `Escalation locked through week ${state.escalation_locked_until_week}`
    });
  }

  return holds;
}

function dateKeyInTimeZone(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyToDayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function formatDueDuration(ms: number): string {
  if (ms >= DAY_MS) {
    return formatDaysHours(ms);
  }

  const totalMinutes = Math.ceil(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatDaysHours(ms: number): string {
  const totalHours = Math.floor(ms / HOUR_MS);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}
