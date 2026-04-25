# Tidal POC — Deployment Guide

## Prerequisites

- [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/):
  `brew install flyctl`
- [Vercel CLI](https://vercel.com/docs/cli): `brew install vercel-cli` (or
  deploy via dashboard)
- `.env` and `.env.local` already present in the repo root (copied from `main`)

---

## Step 1 — Supabase schema

### Local

```bash
supabase start
supabase db reset
```

### Production

```bash
supabase db push
```

### Enable Realtime on `prompts`

In the Supabase dashboard:

1. Go to **Table Editor** → select `prompts`
2. Click the **Realtime** toggle → enable

This cannot be done via SQL migration; it must be done in the dashboard.

---

## Step 2 — Deploy the worker to Fly.io

```bash
# Authenticate
flyctl auth login

# Create the app (first time only)
flyctl apps create tidal-worker

# Import secrets from .env — covers SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
flyctl secrets import --app tidal-worker < .env

# Deploy (run from repo root)
flyctl deploy --app tidal-worker

# Verify
curl https://tidal-worker.fly.dev/health
# → {"ok": true}
```

---

## Step 3 — Deploy the web app to Vercel

In Vercel project settings, set **Root Directory** to:

```text
apps/web
```

### Import existing vars from .env

In the Vercel dashboard → project **Settings** → **Environment Variables** →
click **Import .env** and upload `.env`. This covers `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

Or via CLI:

```bash
# Bulk-add from .env
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  echo "$value" | vercel env add "$key" production
done < .env
```

### Deploy

```bash
vercel --prod
```

Or push to the connected Git branch to auto-deploy.

---

## Step 4 — Local development

`.env.local` has all the required vars. Just run:

```bash
npm run dev
```

For the worker locally (in a separate terminal):

```bash
# One-time setup
python -m venv .venv && source .venv/bin/activate
pip install -r packages/pipeline/requirements.txt -r apps/worker/requirements.txt

# Run from the repo root; this sources vars from .env.local
npm run dev:worker

# Optional reload mode for local editing
npm run dev:worker:reload
```

---

## End-to-end smoke test

1. Open the web app and sign in with an allowlisted Google account
2. Paste a YouTube live stream URL and click **Start Watching**
3. Check the Supabase `sessions` table — a new row should appear with
   `status = active`
4. Within 30–60 seconds, prompt cards should start appearing in the browser
5. Click **Dismiss** on a card → the card fades; the row in `prompts` has
   `dismissed = true`
6. Refresh the page — all historical prompts reload correctly

---

## Troubleshooting

| Symptom                        | Check                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| No prompts after 2+ minutes    | Worker logs: `flyctl logs --app tidal-worker`. pytchat may fail on non-live or private videos.  |
| 500 from `/api/start`          | Verify `WORKER_URL` is set and the worker `/health` returns 200.                                |
| `/denied` for allowlisted user | Check `ALLOWED_EMAILS` matches the exact Google account email (comparison is case-insensitive). |
| Realtime not working           | Confirm Realtime is enabled on `prompts` in the Supabase dashboard.                             |
