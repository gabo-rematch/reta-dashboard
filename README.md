# reta-dashboard

Mobile-first private static dashboard for the `reta` CLI protocol snapshot.

## Local

```bash
npm install
npm run dev
```

## Deploy

Push to `main`; GitHub Actions builds and deploys the static site to Pages. Enable Pages once in repo settings with Source set to GitHub Actions.

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
