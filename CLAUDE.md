# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Next.js on :3000)
npm run build    # Production build
npm run lint     # ESLint
npm test         # Run tests (vitest)
npm run test:watch  # Vitest in watch mode
npm run ingest_video -- <youtube_url_or_video_id>  # Ingest one video's live chat (loads .env)
npm run ingest_channel -- @ChannelHandle          # Poll channel every 10 min, ingest when live
npx tsx --env-file=.env.local scripts/ingest_video.ts <url>       # Same, using .env.local
npx tsx --env-file=.env.local scripts/ingest_channel.ts @Handle   # Same, using .env.local
```

**Supabase local dev:**
```bash
supabase start          # Start local Supabase stack
supabase db reset       # Reset DB + apply migrations + seed
supabase migration new <name>   # Create new migration
```

No test runner is configured.

## Architecture

**Tidal** is a YouTube live chat fan tracker. Users sign in with Google, enter a YouTube video ID, and the app tracks which fans (by YouTube channel ID) have chatted in that stream.

### Stack
- **Next.js 15** (App Router, React 19, TypeScript strict)
- **Supabase** — Postgres + Auth (Google OAuth) + RLS
- **YouTube Data API v3** — live chat messages and video metadata
- **Tailwind CSS**

### Data Model

Two tables, both scoped per user via `owner_user_id` with full RLS:

- **`fans`** — unique YouTube channel IDs (`yt_id`) per owner; name from chat
- **`messages`** — individual chat messages; `fan_id → fans`, `yt_video_id`, `text`, `time`

Unique constraint `(owner_user_id, yt_id)` on both tables enables upsert-based ingestion.

### Key Flows

**Tracking flow (client-driven polling):**
1. User enters video ID on `/` (client component)
2. Browser calls `POST /api/poll` every N seconds (default 30s), passing `nextPageToken`
3. `/api/poll` calls YouTube Live Chat API → upserts fans & messages to Supabase → returns next page token
4. Client owns pagination state; older messages are discarded after 250 locally

**Auth flow:**
- Google OAuth → Supabase Auth → JWT stored in cookies
- `middleware.ts` calls `updateSession()` on every request to refresh tokens and enforce auth
- Unauthenticated requests are redirected to `/login`; `/login` and `/auth/callback` are public

### Supabase Client Usage

Three client factories in `lib/supabase/`:
- `client.ts` → `createSupabaseBrowserClient()` — for client components
- `server.ts` → `createSupabaseServerClient()` — for server components and API routes (uses `cookies()`)
- `admin.ts` → `createSupabaseAdminClient()` — service-role key, bypasses RLS; **scripts and admin routes only, never import from app routes or components**

Always use the server client in API routes and server components. RLS enforces per-user data isolation automatically with either client.

### Migrations

Migration files live in `supabase/migrations/`. Naming convention: `YYYYMMDDHHMMSS_description.sql`. Run `supabase db reset` to replay all migrations locally.

## Current Phase

**Phase 0 — Foundations** (see `docs/PRD.md §9`)

**Goal:** Ingest ≥10K real chat messages across ≥3 broadcasts without any user signing in.

**Exit criterion:** `SELECT COUNT(*), yt_video_id FROM messages GROUP BY yt_video_id` shows ≥10K rows across ≥3 distinct video IDs.

**Ingest setup:**
1. Sign in once via the web app to create your user account
2. Copy your UUID from Supabase dashboard → Authentication → Users
3. Add to `.env`: `INGEST_OWNER_USER_ID=<your-uuid>`
4. Ingest a specific video: `npm run ingest_video -- https://www.youtube.com/watch?v=<ID>`
5. Or watch a channel continuously: `npm run ingest_channel -- @ChannelHandle`
