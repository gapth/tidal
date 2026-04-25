# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Next.js on :3000)
npm run build    # Production build
npm run lint     # ESLint
npm test         # Run tests (vitest)
```

**Supabase local dev:**

```bash
supabase start          # Start local Supabase stack
supabase db reset       # Reset DB + apply migrations + seed
supabase migration new <name>   # Create new migration
```

**Worker local dev:**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt -r worker/requirements.txt
set -a && source .env.local && set +a
uvicorn worker.main:app --reload --port 8080
```

## Architecture

**Tidal** watches a YouTube livestream chat and surfaces real-time prompts for the creator. Users sign in with Google, paste a YouTube livestream URL, and the app starts a long-running worker job that collects chat, runs the prompt pipeline, and streams prompt cards back to the browser through Supabase Realtime.

### Stack

- **Next.js 15** (App Router, React 19, TypeScript strict)
- **Supabase** — Postgres + Auth (Google OAuth) + Realtime
- **Fly.io worker** — long-running FastAPI worker for chat collection + LLM prompt generation
- **YouTube Data API v3** — `liveChatMessages.streamList` gRPC endpoint for live chat collection in the worker (`YOUTUBE_API_KEY` required)
- **OpenAI API** — LLM calls in the prompt pipeline
- **Tailwind CSS**

### Data Model

The active POC data model is only:

- **`sessions`** — one livestream watching run; stores `video_id`, original `youtube_url`, `status`, and `created_at`
- **`prompts`** — prompt cards emitted by the worker; stores `session_id`, `source`, `category`, `content`, `dismissed`, and `created_at`

Realtime must be enabled for `prompts` in the Supabase dashboard.

### Key Flows

**Start/watch flow:**

1. User enters a YouTube livestream URL on `/`
2. `POST /api/start` parses the video ID and inserts a row in `sessions`
3. The web app calls `WORKER_URL/api/start` with `video_id` and `session_id`
4. The Fly.io worker runs the long-lived scraper + LLM job
5. The worker writes prompt rows to `prompts`
6. `/session/[session_id]` loads historical prompts and subscribes to new prompt inserts through Supabase Realtime
7. Dismissing a card updates `prompts.dismissed = true`

**Stop/resume flow:**

- `POST /api/stop` asks the worker to stop a session and marks it `stopped`
- `POST /api/resume` reads the session and asks the worker to start again

**Auth flow:**

- Google OAuth → Supabase Auth → JWT stored in cookies
- `middleware.ts` calls `updateSession()` on every request to refresh tokens and enforce auth
- Unauthenticated requests are redirected to `/login`; `/login`, `/auth/callback`, and `/denied` are public
- Access is restricted by `ALLOWED_EMAILS`

### Supabase Client Usage

Three client factories in `lib/supabase/`:

- `client.ts` → `createSupabaseBrowserClient()` — for client components
- `server.ts` → `createSupabaseServerClient()` — for server components and API routes (uses `cookies()`)
- `admin.ts` → `createSupabaseAdminClient()` — service-role key for trusted server-side writes

Use the browser/server client for authenticated UI reads and writes. Use the admin client only where service-role access is intentional, such as creating sessions from API routes and worker-side database writes.

### Migrations

Migration files live in `supabase/migrations/`. Naming convention: `YYYYMMDDHHMMSS_description.sql`. Run `supabase db reset` to replay all migrations locally.

### Deployment Notes

- Web app deploys to Vercel.
- Worker deploys to Fly.io as `tidal-worker`.
- `WORKER_URL` should point to the worker (`https://tidal-worker.fly.dev` in production, `http://localhost:8080` locally).
- Fly.io worker secrets come from `.env` and must include Supabase service-role access, `OPENAI_API_KEY`, and `YOUTUBE_API_KEY`.
- Proto stubs (`worker/stream_list_pb2.py`, `worker/stream_list_pb2_grpc.py`) are generated from `worker/stream_list.proto` and checked in. To regenerate: `pip install grpcio-tools && PROTO_INCLUDE=$(python -c "import grpc_tools, os; print(os.path.join(os.path.dirname(grpc_tools.__file__), '_proto'))") && python -m grpc_tools.protoc -I"$PROTO_INCLUDE" -Iworker --python_out=worker --grpc_python_out=worker worker/stream_list.proto` (then fix the import in `stream_list_pb2_grpc.py`: `from worker import stream_list_pb2 as ...`).
