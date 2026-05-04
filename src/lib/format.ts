import type { Injection, Symptom } from "./types";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function relativeTime(value: string, now: Date): string {
  const date = new Date(value);
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  if (absMs < MINUTE_MS) {
    return "just now";
  }

  const suffix = diffMs < 0 ? "ago" : "from now";

  if (absMs < HOUR_MS) {
    return `${Math.round(absMs / MINUTE_MS)}m ${suffix}`;
  }

  if (absMs < DAY_MS) {
    return `${Math.round(absMs / HOUR_MS)}h ${suffix}`;
  }

  return `${Math.round(absMs / DAY_MS)}d ${suffix}`;
}

export function formatDose(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
}

export function injectionSummary(injection: Injection): string {
  const site = injection.site ? ` · ${injection.site}` : "";
  return `${formatDose(injection.dose_mg)} mg · ${injection.clicks} clicks${site}`;
}

export function symptomSummary(symptom: Symptom): string {
  const vomit = symptom.vomit === 1 ? " · vomiting" : "";
  return `${symptom.category} · severity ${symptom.severity}${vomit}`;
}
