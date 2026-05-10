# reta-worker

Cloudflare Worker for `reta` PWA push reminders and the server-side symptom and
injection queues.

## Deploy

```bash
npm install
wrangler kv:namespace create reta-worker-kv
```

Paste the returned namespace id into `wrangler.toml` under `id`.

Generate and set secrets:

```bash
npx web-push generate-vapid-keys
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT
openssl rand -base64 32
wrangler secret put DRAIN_TOKEN
```

Use a subject such as `mailto:gabriel@getrematched.com`.

Deploy after the namespace id and secrets are set:

```bash
wrangler deploy
```

## Local

```bash
npm run dev
npm test -- --run
```
