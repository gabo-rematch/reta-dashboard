import { describe, expect, it } from "vitest";
import {
  activeHolds,
  currentWeek,
  nextDoseCountdown,
  weeksOfSupply
} from "../src/lib/state";
import type { Pen, ProtocolState, Symptom } from "../src/lib/types";

const protocolState = (
  overrides: Partial<ProtocolState> = {}
): ProtocolState => ({
  id: 1,
  current_week: 1,
  current_step: 1,
  current_dose_mg: 0.4,
  next_dose_due: "2026-05-09T14:40:00Z",
  escalation_locked_until_week: null,
  started_on: "2026-05-02",
  injection_weekday: 5,
  ...overrides
});

const symptom = (overrides: Partial<Symptom>): Symptom => ({
  id: 1,
  ts: "2026-05-03T08:00:00Z",
  category: "nausea",
  severity: 1,
  vomit: 0,
  note: null,
  ...overrides
});

describe("currentWeek", () => {
  it("uses the project timezone when deriving the local date", () => {
    const week = currentWeek(
      "2026-05-02",
      new Date("2026-05-09T20:30:00Z"),
      "Asia/Dubai"
    );

    expect(week).toBe(2);
  });

  it("never returns less than week 1", () => {
    expect(
      currentWeek("2026-05-02", new Date("2026-04-30T23:00:00Z"), "Asia/Dubai")
    ).toBe(1);
  });
});

describe("nextDoseCountdown", () => {
  it("reports no scheduled dose without protocol state", () => {
    expect(nextDoseCountdown(undefined, new Date("2026-05-04T00:00:00Z"))).toEqual({
      dueAt: null,
      dueInMs: null,
      overdueMs: null,
      friendly: "no dose scheduled"
    });
  });

  it("reports no scheduled dose when next_dose_due is null", () => {
    expect(
      nextDoseCountdown(
        protocolState({ next_dose_due: null }),
        new Date("2026-05-04T00:00:00Z")
      ).friendly
    ).toBe("no dose scheduled");
  });

  it("formats due-in values in days and hours", () => {
    const result = nextDoseCountdown(
      protocolState({ next_dose_due: "2026-05-06T15:00:00Z" }),
      new Date("2026-05-04T10:00:00Z")
    );

    expect(result.dueAt?.toISOString()).toBe("2026-05-06T15:00:00.000Z");
    expect(result.dueInMs).toBe(190_800_000);
    expect(result.overdueMs).toBeNull();
    expect(result.friendly).toBe("due in 2d 5h");
  });

  it("formats due-in values under one day in hours and minutes", () => {
    const result = nextDoseCountdown(
      protocolState({ next_dose_due: "2026-05-04T15:45:00Z" }),
      new Date("2026-05-04T10:00:00Z")
    );

    expect(result.friendly).toBe("due in 5h 45m");
  });

  it("formats overdue values in days and hours", () => {
    const result = nextDoseCountdown(
      protocolState({ next_dose_due: "2026-05-02T04:00:00Z" }),
      new Date("2026-05-04T10:30:00Z")
    );

    expect(result.dueInMs).toBeNull();
    expect(result.overdueMs).toBe(196_200_000);
    expect(result.friendly).toBe("overdue by 2d 6h");
  });
});

describe("weeksOfSupply", () => {
  it("calculates weeks at the current dose and marks low supply", () => {
    const result = weeksOfSupply(
      { id: 1, opened_on: "2026-05-02", total_mg: 30, mg_remaining: 0.75, lot: null, source: null, is_active: 1, created_at: null },
      0.5
    );

    expect(result).toEqual({ mgRemaining: 0.75, weeks: 1.5, low: true });
  });

  it("handles missing pens and non-positive doses", () => {
    expect(weeksOfSupply(undefined, 0)).toEqual({
      mgRemaining: 0,
      weeks: 0,
      low: true
    });
  });
});

describe("activeHolds", () => {
  const now = new Date("2026-05-10T00:00:00Z");

  it("returns active vomit, severity, and manual holds", () => {
    const holds = activeHolds(
      [
        symptom({ id: 1, ts: "2026-05-09T00:00:00Z", vomit: 1 }),
        symptom({ id: 2, ts: "2026-05-08T00:00:00Z", category: "fatigue", severity: 4 })
      ],
      protocolState({ escalation_locked_until_week: 3 }),
      2,
      now
    );

    expect(holds).toEqual([
      { source: "vomit", name: "Vomiting", reason: "Vomiting logged in the last 7 days" },
      { source: "severity", name: "High severity", reason: "Symptom severity 4+ logged in the last 7 days" },
      { source: "manual", name: "Manual hold", reason: "Escalation locked through week 3" }
    ]);
  });

  it("ignores old symptoms and expired manual holds", () => {
    expect(
      activeHolds(
        [
          symptom({ id: 1, ts: "2026-05-01T00:00:00Z", vomit: 1 }),
          symptom({ id: 2, ts: "2026-05-02T23:59:59Z", severity: 5 })
        ],
        protocolState({ escalation_locked_until_week: 1 }),
        2,
        now
      )
    ).toEqual([]);
  });
});
