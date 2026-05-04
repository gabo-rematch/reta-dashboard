# reta-dashboard

Mobile-first private static dashboard for the `reta` CLI protocol snapshot.

## Local

```bash
npm install
npm run dev
```

## Deploy

Push to `main`; GitHub Actions builds and deploys the static site to Pages. Enable Pages once in repo settings with Source set to GitHub Actions.

## PWA + push notifications

On iOS Safari, open the GitHub Pages dashboard, choose Add to Home Screen, then
open `reta` from the standalone icon and tap Enable daily reminders after
unlocking the dashboard.

The Cloudflare Worker lives in `worker/` and deploys separately:

```bash
pnpm --filter worker deploy
```

One-time setup:

```bash
npx web-push generate-vapid-keys
openssl rand -base64 32
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `DRAIN_TOKEN`
with `wrangler secret put <NAME>` from `worker/`. Symptoms entered in the PWA
queue server-side; a launchd job on the Mac drains them every 15 min via
`reta log symptom` (separate setup, not in this repo).

## Data

`public/data/reta.enc.json` comes from:

```bash
reta dash sync
```

For local fixture updates before sync is wired end-to-end, export JSON from the
CLI and encrypt it with the dashboard passphrase.

## Privacy

Data is AES-256-GCM-encrypted with a passphrase you choose via
`reta dash set-passphrase`. The dashboard prompts for it on load. Use a strong
passphrase (16+ chars). Save it in your password manager.
