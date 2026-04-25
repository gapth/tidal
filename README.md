# Tidal

Current status: proof of concept.

Tidal helps live creators understand what matters in YouTube chat right now and
act on it in the moment. A creator signs in, pastes a YouTube livestream URL,
and Tidal starts a worker that collects live chat, processes the stream with
OpenAI-backed prompt logic, and sends high-signal prompt cards back to the
creator UI in real time.

## Why It Exists

Live chat can move faster than a creator can interpret while they are
performing, answering questions, tracking room energy, and deciding what to do
next. Existing tools mostly show the chat firehose, moderate messages, trigger
alerts, or summarize after the stream.

Tidal focuses on the live moment:

- What matters in chat right now?
- Why does it matter?
- What should the creator do next?

The product goal is sparse, timely assistance rather than comprehensive
analytics. Tidal is not a chatbot, moderation bot, overlay product, or
post-stream dashboard.

## What It Does

- Starts a watch session from a YouTube livestream URL.
- Collects live chat messages from YouTube.
- Detects useful creator prompts such as novel questions, repeated questions,
  monetization events, acknowledgment candidates, confusion clusters, energy
  spikes, sentiment shifts, factual corrections, and stream quality issues.
- Stores sessions and prompt cards in Supabase.
- Streams new prompt cards to the browser through Supabase Realtime.
- Lets the creator dismiss, stop, and resume sessions.
- Restricts access to allowlisted Google accounts during the POC.

## Architecture

```text
Creator browser
  |
  | Next.js app on Vercel
  | - Google sign-in through Supabase Auth
  | - Start, stop, and resume API routes
  | - Realtime prompt feed
  v
Supabase
  | - Postgres: sessions, prompts
  | - Auth: Google OAuth
  | - Realtime: prompt inserts
  v
Fly.io worker
  | - FastAPI long-running session worker
  | - YouTube live chat collection
  | - Prompt pipeline adapter
  v
External APIs
  | - YouTube Data API / live chat
  | - OpenAI processing
```

### Web

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS.
- Deployed to Vercel from `apps/web`.
- Uses Supabase browser/server clients for authenticated UI reads and writes.
- Uses a Supabase service-role admin client only for trusted server-side routes.

### Data

- Supabase Postgres stores the active POC model:
  - `sessions`: one livestream watching run.
  - `prompts`: prompt cards emitted by the worker.
- Supabase Auth handles Google OAuth.
- Supabase Realtime broadcasts inserted prompt rows to the session page.

### Worker

- Python FastAPI service deployed on Fly.io.
- Accepts `/api/start` and `/api/stop` requests from the web app.
- Collects YouTube live chat for a session.
- Runs prompt detection and OpenAI processing through the shared pipeline
  package.
- Writes prompt rows back to Supabase.

## Local Setup

Prerequisites:

- Node.js and npm
- Python 3
- Supabase CLI
- A local `.env.local` created from `.env.example`

Create local environment values:

```bash
cp .env.example .env.local
```

Fill in the blank values in `.env.local`. At minimum, local development needs
Supabase connection values, Google OAuth values for Supabase Auth,
`YOUTUBE_API_KEY`, `OPENAI_API_KEY`, `WORKER_URL`, and `ALLOWED_EMAILS`.

Install dependencies:

```bash
npm install
python -m venv .venv
source .venv/bin/activate
pip install -r packages/pipeline/requirements.txt -r apps/worker/requirements.txt
```

Start Supabase locally and apply migrations:

```bash
supabase start
supabase db reset
```

Run the web app:

```bash
npm run dev
```

Run the worker in a separate terminal:

```bash
source .venv/bin/activate
npm run dev:worker
```

Useful checks:

```bash
npm run lint
npm test
npm run build
```

## Environment Variables

`.env.example` is committed with keys only. Real values belong in `.env.local`,
`.env`, Vercel environment variables, and Fly.io secrets.

Key variables:

- `YOUTUBE_API_KEY`: YouTube API access for live chat collection.
- `SUPABASE_URL`: Server-side Supabase URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Trusted server/worker Supabase key.
- `NEXT_PUBLIC_SUPABASE_URL`: Browser-safe Supabase URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Browser-safe Supabase publishable key.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`: Google OAuth client ID used by
  Supabase Auth.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`: Google OAuth secret used by Supabase
  Auth.
- `DATABASE_URL`: Direct Postgres connection string.
- `OPENAI_API_KEY`: OpenAI API key for prompt processing.
- `WORKER_URL`: Worker base URL, for example `http://localhost:8080` locally or
  the Fly.io worker URL in production.
- `ALLOWED_EMAILS`: Comma-separated allowlist for POC access.

## Deployment Notes

### Supabase

Apply schema migrations:

```bash
supabase db push
```

Enable Realtime for the `prompts` table in the Supabase dashboard. This is
required for live prompt cards to appear in the browser.

### Fly.io Worker

The worker deploys as `tidal-worker` from the repository root:

```bash
flyctl apps create tidal-worker
flyctl secrets import --app tidal-worker < .env
flyctl deploy --app tidal-worker
curl https://tidal-worker.fly.dev/health
```

Production worker secrets must include Supabase service-role access,
`OPENAI_API_KEY`, and `YOUTUBE_API_KEY`.

### Vercel Web App

Deploy the web app from `apps/web`. In Vercel project settings, set Root
Directory to:

```text
apps/web
```

Set the required environment variables in Vercel, including:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WORKER_URL`
- `ALLOWED_EMAILS`

`WORKER_URL` should point to the Fly.io worker in production, for example:

```text
https://tidal-worker.fly.dev
```

## Compliance

Tidal should use official APIs and user-authorized flows where applicable. The
POC uses Google sign-in through Supabase Auth for creator access, YouTube API
access for livestream chat collection, and OpenAI API calls for processing. Do
not commit private API keys, OAuth secrets, service-role keys, database URLs, or
user data.

## Repository Layout

```text
apps/web/           Next.js creator UI and API routes
apps/worker/        FastAPI worker for chat collection and prompt emission
packages/pipeline/  Shared prompt detection and processing code
supabase/           Local Supabase config and migrations
spikes/             Early technical explorations
DEPLOY.md           Detailed deployment runbook
CLAUDE.md           Developer notes for coding agents
```
