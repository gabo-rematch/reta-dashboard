# reta-dashboard — plan

**Date:** 2026-05-04
**Owner:** Gabriel (personal)
**Repo:** https://github.com/gabo-rematch/reta-dashboard (private)
**Local:** /Users/gabo/Desktop/Projects/reta-dashboard
**Companion CLI:** /Users/gabo/Desktop/Projects/reta (commits f15a555 … ae6494f)

## Goal

Mobile-first private static dashboard for the reta CLI's protocol state. Read-only.
The CLI remains the source of truth for writes; this surface is a glance-and-go view
the user can pull up on his phone to see where the protocol stands.

## Success criteria

- Loads in < 1 s on mobile (lighthouse ≥ 95 perf).
- Renders correctly on iPhone-width viewports (375 px) and dark by default.
- Does NOT call the network at runtime; all data ships in `data/reta.json` baked into the deploy.
- Tailwind only — no component library bloat.
- One page, no routing, no auth UI (private GitHub Pages already gates access).

## Scope

### In
- Vite + React + TypeScript + Tailwind. Static build to `dist/`.
- Single page that reads `/data/reta.json` (placed under `public/data/reta.json`).
- Four cards (top-down):
  1. **Hero**: current week / step / dose, last-injection timestamp + relative time, countdown to next dose.
  2. **Pen supply**: active pen mg + estimated weeks at current dose; red below 2 weeks.
  3. **Holds**: only rendered if any flags are active; one row per flag with source colour.
  4. **History (collapsible, default closed)**: last 14 days of injections + symptoms, table form, ts + summary.
- Friendly empty state when `reta.json` doesn't yet have any injections logged.
- GitHub Actions workflow that builds and deploys to GitHub Pages on push to `main`.

### Out (this iteration)
- Vitals sparklines (cut for simplicity per user direction).
- Any write surface; CLI handles writes.
- Auth UI / login flow; private GitHub Pages handles access.
- PWA / offline shell; can revisit if needed.
- Multi-page navigation.
- Charts / graphs of weekly_metrics; can revisit.

## Data contract — `public/data/reta.json`

Produced by `reta export --format json` (already shipped). Top-level shape:

```json
{
  "pens":             [{ "id": 1, "opened_on": "...", "total_mg": 30, "mg_remaining": 29.6, "is_active": 1, ... }],
  "injections":       [{ "id": 1, "ts": "...", "dose_mg": 0.4, "clicks": 4, "site": "abdomen", "pen_id": 1, ... }],
  "symptoms":         [{ "id": ..., "ts": "...", "category": "...", "severity": ..., "vomit": 0|1, ... }],
  "daily_vitals":     [{ "date": "...", "rhr": ..., "hrv": ..., "note": ... }],
  "weekly_metrics":   [{ "week_start": "...", "weight_kg": ..., "avg_rhr": ..., ... }],
  "protocol_state":   [{ "current_week": 1, "current_step": 1, "current_dose_mg": 0.4, "next_dose_due": "...", "started_on": "...", "injection_weekday": 5, "escalation_locked_until_week": null }],
  "schema_version":   [{ "version": 1 }, { "version": 2 }],
  "whoop_sync_log":   [...]
}
```

Frontend assumes `protocol_state` is either empty or has exactly one row.

The dashboard re-derives `current_week` and the live hold flags client-side rather
than reading them from a precomputed payload — the JSON is raw rows. Hold-rule logic
is duplicated here as a small TypeScript port (vomit-window / severity / manual);
RHR-sustained is left out for now since the dashboard has no notion of baseline_rhr
(it's a derived stat the CLI computes against config.baseline_window_days). If the
holds card needs RHR fidelity, switch to a precomputed `protocol_status.json`.

## Phase breakdown

### Phase D1 — scaffold + UI + sample data
- Vite + React + TS + Tailwind project.
- `src/lib/types.ts` (mirrors the export shape).
- `src/lib/state.ts` — pure functions for: `currentWeek(startedOn, now, tz)`,
  `nextDoseCountdown(state, now)`, `weeksOfSupply(pen, doseMg)`,
  `activeHolds(symptoms, state, currentWeek, now)` (vomit, severity, manual).
- Components: `<Hero>`, `<PenCard>`, `<HoldsCard>`, `<History>`, `<EmptyState>`.
- `public/data/reta.json` checked-in sample (today's actual snapshot) so the page
  has something to render before sync is wired.
- Unit tests (vitest) for state.ts edge cases.

### Phase D2 — GitHub Pages deploy
- `.github/workflows/pages.yml`: on push to main, install + build + upload artifact
  + deploy.
- Enable Pages in repo settings (manual: user does it once, or `gh api` enables it).
- Verify build at https://gabo-rematch.github.io/reta-dashboard/.

### Phase D3 — `reta dash sync` (in the reta CLI repo)
- Add subcommand to `reta` that:
  1. exports JSON to `<dashboard-repo>/public/data/reta.json`
  2. `git -C <dashboard-repo> add` + `commit -m 'sync: <ts>'`
  3. `git push origin main`
- Default `--repo` from a config field `dashboard_repo` (added to `~/.reta/config.toml`).

## Risks / non-obvious

- **Private Pages on personal accounts** is a Pro feature. `gabo-rematch` must have a
  Pro plan or the deploy will fail with a permissions error — in which case fall back
  to non-Pages hosting (e.g. Cloudflare Pages or a `gh-pages` branch served via raw).
- **JSON commits are not the right pattern long-term** — every sync churns git history.
  Acceptable now; revisit if commit volume becomes a problem.
- **Mobile viewport** — must test at 375 px; Tailwind defaults are mobile-first so this
  should be cheap.
- **No baseline_rhr in JSON** — holds card under-reports RHR-sustained flag.
  Acceptable: the CLI is the authority and `reta status` will show the truth.
- **Public Pages by accident** — verify Pages source is set to private after first deploy.

## Out-of-scope explicit

- Charts and graphs.
- PWA / offline.
- Auth UI.
- Realtime updates / push.
- Multi-user.
