# Tidal POC — Deployment Guide

## Prerequisites

- [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/): `brew install flyctl`
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel` (or deploy via dashboard)
- `.env` and `.env.local` already present in the repo root (copied from `main`)

---

## Step 1 — Pipeline directory

The worker depends on `pipeline/` being inside this repo. It was already copied
during setup. If you re-clone or the directory is missing:

```bash
cp -r ~/dev/tidal-pipeline-skeleton/pipeline ./pipeline
```

---

## Step 2 — Supabase schema

### Option A — Local Supabase

```bash
supabase start
supabase db reset
```

### Option B — Supabase cloud (SQL editor)

Paste the contents of `supabase/schema.sql` into the Supabase SQL editor and run it.

### Enable Realtime on `prompts`

In the Supabase dashboard:

1. Go to **Table Editor** → select `prompts`
2. Click the **Realtime** toggle → enable

This cannot be done via SQL migration; it must be done in the dashboard.

---

## Step 3 — Deploy the worker to Fly.io

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

## Step 4 — Deploy the web app to Vercel

### Import existing vars from .env

In the Vercel dashboard → project **Settings** → **Environment Variables** → click
**Import .env** and upload `.env.local`. This covers `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

Or via CLI (run once per var, or use the loop below):

```bash
# Bulk-add from .env.local
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  echo "$value" | vercel env add "$key" production
done < .env.local
```

### Add the two new vars manually

These aren't in `.env` — add them in the Vercel dashboard or via CLI:

```bash
echo "https://tidal-worker.fly.dev" | vercel env add WORKER_URL production
echo "your@email.com,other@email.com" | vercel env add ALLOWED_EMAILS production
```

Also add `WORKER_URL` and `ALLOWED_EMAILS` to your local `.env.local`:

```
WORKER_URL=https://tidal-worker.fly.dev
ALLOWED_EMAILS=your@email.com
```

### Deploy

```bash
vercel --prod
```

Or push to the connected Git branch to auto-deploy.

---

## Step 5 — Local development

`.env.local` already has the Supabase and OpenAI keys. Just add the two new vars
(see above), then:

```bash
npm run dev
```

For the worker locally (in a separate terminal):

```bash
# One-time setup
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt -r worker/requirements.txt

# Run (sources vars from .env)
set -a && source .env && set +a
uvicorn worker.main:app --reload --port 8080
```

---

## End-to-end smoke test

1. Open the web app and sign in with an allowlisted Google account
2. Paste a YouTube live stream URL and click **Start Watching**
3. Check the Supabase `sessions` table — a new row should appear with `status = active`
4. Within 30–60 seconds, prompt cards should start appearing in the browser
5. Click **Dismiss** on a card → the card fades; the row in `prompts` has `dismissed = true`
6. Refresh the page — all historical prompts reload correctly

---

## Troubleshooting

| Symptom                        | Check                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| No prompts after 2+ minutes    | Worker logs: `flyctl logs --app tidal-worker`. pytchat may fail on non-live or private videos.         |
| 500 from `/api/start`          | Verify `WORKER_URL` is set and the worker `/health` returns 200.                                       |
| `/denied` for allowlisted user | Check `ALLOWED_EMAILS` matches the exact Google account email (comparison is case-insensitive).        |
| Realtime not working           | Confirm Realtime is enabled on `prompts` in the Supabase dashboard.                                    |
| Worker crashes on deploy       | Ensure `pipeline/` exists at repo root. Run `cp -r ~/dev/tidal-pipeline-skeleton/pipeline ./pipeline`. |
