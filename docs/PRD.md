# Tidal — Product Requirements Document (v0.1)

**Owner:** Gap
**Status:** Draft — scaffolding, expect revisions
**Last updated:** 2026-04-17
**Audience:** Internal founding team

---

## 1. Summary

Tidal helps content creators turn passive viewers into paying fans. Our first wedge is **YouTube live streamers**, who already have monetization surfaces (Super Chat, channel memberships, gifted memberships) but lack the tooling to know *which* viewers are on the cusp of converting — and what to do about it in the moment.

We ingest live chat activity, build a per-fan profile over time, score likelihood-to-convert, and surface actionable nudges both (a) in a dashboard between streams and (b) in a live companion view during streams.

## 2. Problem

Live streamers on YouTube operate on intuition. The top fans they thank on-stream are usually the already-converted ones (members, frequent Super Chatters) or whoever happened to post the most chat messages that day. The *near-converters* — viewers who show up every stream, engage consistently, and would convert with the smallest nudge — are largely invisible in YouTube's native UI.

Streamers lose revenue and lose the chance to deepen relationships with high-intent fans. They also burn out trying to track this manually.

## 3. Target user (v1)

- **YouTube live streamers** with recurring live streams (at least weekly) and an active live chat (~50+ messages per stream).
- English-speaking to start (for sentiment / intent analysis simplicity).
- Mid-tier creators (1K–500K subs) are the sweet spot: big enough to have signal, small enough that they can't manually track fans.

## 4. Goals & non-goals for v1

**Goals**
- Connect a streamer's YouTube account and track a selected channel's live activity.
- Build a persistent, cross-stream view of fans on that channel.
- Produce a ranked list of "nudge-worthy" fans with a defensible scoring explanation.
- Deliver actionable in-stream recommendations during a live broadcast.

**Non-goals (v1)**
- Multi-platform (Twitch, TikTok, Kick) — parked for later.
- Off-platform payment tracking (Patreon, Ko-fi) — parked.
- Automated messaging / DM to fans — parked; nudges are surfaced *to the streamer* only.
- Team / multi-user accounts — single-seat only.
- Mobile app — web-only at launch.

## 5. Key user journeys

**J1. First-run setup**
Streamer signs up → Google OAuth → selects which of their YouTube channels Tidal should monitor → sees an empty "we'll start tracking from here" dashboard.

**J2. Between streams — "who should I focus on next time?"**
Streamer opens dashboard → sees a ranked list of fans with a conversion score, a short explanation ("has chatted in 7 of your last 8 streams, never Super Chatted, recently asked you a direct question"), and suggested actions.

**J3. During stream — "what should I do right now?"**
Streamer opens the live companion view next to OBS → sees fans currently in chat with high conversion scores, with a one-line prompt ("Shout out @username — they've been here 6 weeks running and haven't Super Chatted yet").

**J4. Post-stream reflection**
After the stream ends, streamer gets a quick recap: who was present, who was called out, whether any called-out fans converted.

## 6. Feature specs (v1)

### F1. Google OAuth + channel selection

- Sign in with Google (YouTube scopes: `youtube.readonly`, `youtube.force-ssl` as needed for live chat read).
- On first connect, list the channels the authenticated account manages.
- User picks one or more channels to monitor. They can change this later in settings.
- Store refresh token securely; re-auth flow when scopes need to widen.

**Acceptance:** A user can sign up, connect, and select a channel in under 60 seconds. Tokens persist and auto-refresh.

### F2. Automatic live-chat tracking

- Detect when a selected channel goes live (poll `liveBroadcasts` or `search` for active broadcasts on a cadence).
- When live, stream chat via `liveChatMessages.list` until the broadcast ends.
- Normalize each message into `{fan_id, channel_id, broadcast_id, timestamp, text, super_chat_amount?, membership_event?}`.
- Resolve fans by their YouTube channel ID so identity persists across streams.
- Back-fill does **not** happen for chat (YouTube's live chat is not queryable after the stream). What we miss before the user connects is gone. We're explicit about this in the UI.

**Acceptance:** For any live broadcast that starts after channel is connected, ≥95% of public chat messages are captured and attributed to a stable fan ID.

### F3. Between-stream insights dashboard

- A ranked list of fans on the connected channel.
- Each fan card shows: display name, avatar, conversion score (0–100), top signal drivers, recent activity summary, suggested nudge.
- Filters: "Never Super Chatted", "Not a member", "Last seen < 7d", etc.
- Detail view: full chat history with the streamer, timeline of appearances, monetization history.

**Scoring signals (v1, heuristic — not ML):**
- Stream attendance frequency (last N streams)
- Chat volume per appearance
- Recency of last appearance
- Presence of direct-address messages ("great stream", questions, @mentions of the streamer)
- Absence of monetization events (member / Super Chat / gifted member)
- Duration of relationship (weeks since first observed)

We compute a transparent weighted score and **always show the "why"**. Black-box scoring is a non-starter for this audience — creators need to trust it.

**Acceptance:** Dashboard renders in <2s for a channel with 10K tracked fans. "Why this score" is visible on every ranked fan.

### F4. In-stream companion view

- A lightweight web view the streamer keeps open during broadcast (second monitor or phone).
- Shows: current viewers in chat who are in the tracked-fan set, sorted by conversion score.
- Each entry has a single-line action prompt ("Thank them on-air", "Ask them how their week went — they mentioned being stressed last stream").
- Real-time: updates as new fans appear in chat.
- Snooze / dismiss per fan for the current stream.

**Acceptance:** Latency from fan sending a chat message to appearing in companion view: <10s at p95. Streamer can act on a nudge in a single glance.

## 7. Supporting infrastructure (not user-facing, but required)

### S1. Manual video/stream ingestion tool (pre-OAuth)

Before F1–F4 exist in a usable state, we need test data. We build an **internal admin tool** that:
- Accepts a YouTube video URL or channel URL.
- Pulls chat replay (for completed streams where available via `liveChatMessages` during the live window, or by running a dummy listener against a public live stream we don't own).
- Populates our data model with real signal.

This lets us develop scoring, dashboard, and companion view *without* needing anyone to sign in. It also becomes our eval harness.

**Note:** YouTube live chat is not replayable after the fact via the public API. So this tool is really a *live listener* we point at any public broadcast — our own test channel, a friendly creator, or a large public stream we monitor for stress-testing volume.

### S2. Fan identity resolution

Fans are keyed by YouTube channel ID. Display name changes are tracked but don't fragment the record. Anonymous / "removed channel" users are bucketed separately and excluded from scoring.

### S3. Data model sketch (first pass)

```
streamers (our users)         → id, google_sub, email, created_at
connections                   → id, streamer_id, yt_channel_id, scopes, refresh_token, connected_at
broadcasts                    → id, yt_channel_id, yt_broadcast_id, started_at, ended_at
fans                          → id, yt_channel_id (fan's own), first_seen_at, display_name, avatar_url
fan_channel_stats             → fan_id, tracked_yt_channel_id, streams_attended, messages_total,
                                last_seen_at, super_chat_total_usd, is_member, score, score_breakdown
chat_messages                 → id, broadcast_id, fan_id, ts, text, super_chat_amount_usd, membership_type
nudges                        → id, fan_id, broadcast_id, type, suggested_at, acted_on
```

## 8. Technical approach (lean, cloud-agnostic)

- **Frontend:** Next.js (single repo, app router). Tailwind. Deploy on Vercel free tier until it hurts.
- **Backend API:** Node/TypeScript in the same Next.js app (API routes) for v0. Split into a standalone service only when background work demands it.
- **Database:** Postgres. Neon or Supabase free tier. One schema, no ORMs beyond Prisma/Drizzle.
- **Background workers:** Long-running chat listeners can't live in serverless (they need persistent connections). Run them on a single small VM (Fly.io / Railway / Hetzner — whichever is cheapest at the time). One worker process per active broadcast; coordinated via a simple DB-backed job queue.
- **Auth:** NextAuth with Google provider; store refresh tokens encrypted at rest.
- **Real-time for companion view:** Server-Sent Events from the worker through the web app. Avoid WebSockets / Pusher until we have a reason.
- **No ML infra for v1.** Scoring is a deterministic weighted function computed on write. This keeps us cheap and explainable.
- **Observability:** Logflare or similar free-tier log sink; a single dashboard of "active broadcasts, messages/sec, errors".
- **Secrets:** Env vars via the host's secret manager. No Vault, no KMS yet.

**Key cost risks to watch:**
- YouTube Data API quota (10K units/day free). `liveChatMessages.list` is cheap (1 unit/call) but polling adds up across many concurrent broadcasts. We'll request a quota increase early.
- Persistent worker VM: ~$5–10/mo baseline is fine for dozens of concurrent broadcasts.

## 9. Development plan

Optimized to get to a launchable v1 with minimum spend and without blocking on user recruitment.

### Phase 0 — Foundations (Week 1–2)

**Goal:** Ingest real chat data from a public stream without any user having to sign in. Ship nothing external.

- Stand up repo, Next.js app shell, Postgres, one dev environment.
- Build the **manual ingestion tool (S1)**: CLI command `tidal ingest <video_url>` that attaches to a live broadcast's chat and writes to our DB.
- Data model v0 (§7.3) migrated in.
- Point it at 2–3 public live streams (ideally ones we have permission to observe, e.g. a friendly creator's channel) and accumulate real data for ~a week.

**Exit criterion:** We have ≥10K real chat messages across ≥3 broadcasts in our DB.

### Phase 1 — Offline insights (Week 3–4)

**Goal:** Prove we can produce a "nudge-worthy fans" list that a streamer would find interesting. No product UI needed — just conviction.

- Implement scoring function (§6.F3) as a SQL view or a small service.
- Build a bare-bones internal dashboard (protected route, no auth polish) that ranks fans for a given channel.
- Manually review top-20 lists with a cofounder / friendly creator: "would you thank these people?"
- Iterate scoring weights based on qualitative feedback.

**Exit criterion:** A friendly creator, shown our top-20 list for their channel, says "yes, these are the right people" ≥70% of the time.

### Phase 2 — OAuth + self-serve (Week 5–6)

**Goal:** A real streamer can sign up and be tracked without our involvement.

- Implement F1 (Google OAuth + channel selection).
- Replace the manual ingestion tool with an auto-scheduler that detects when connected channels go live and spins up a listener.
- Add a minimal marketing page + waitlist.
- Harden token refresh, handle quota errors gracefully.

**Exit criterion:** One external creator signs up end-to-end, their next live stream is captured automatically, and the data looks right 24h later.

### Phase 3 — Dashboard polish (Week 7–8)

**Goal:** The between-stream insights experience (F3) is good enough to keep users coming back.

- Fan list UI with filters, detail view, score-breakdown tooltip.
- Email digest: "Your top 5 nudge-worthy fans for this week's stream."
- Basic settings (disconnect channel, change scope).
- Telemetry: track which fans users click into, which nudges they act on.

**Exit criterion:** 3 external creators using Tidal between streams; ≥1 reports they changed on-air behavior because of it.

### Phase 4 — Live companion (Week 9–10)

**Goal:** F4 lives. The streamer has a reason to keep Tidal open *while* streaming.

- Real-time companion view, SSE pipeline.
- Per-fan nudge prompts.
- Post-stream recap: who we flagged, who got called out, who converted.
- Instrument conversion attribution (Super Chat / new member in the X minutes after a nudge was surfaced).

**Exit criterion:** At least one creator reports a Super Chat that, in their view, happened *because* of a Tidal nudge. This is the moment we have a story to tell.

### Phase 5 — Launch readiness (Week 11–12)

- Billing (Stripe; simple monthly tier).
- Onboarding polish, help docs, status page.
- Tighter quota management, multi-channel support for single streamer.
- Legal: ToS, privacy policy (we're storing chat messages about third parties — get this right), YouTube API ToS compliance review.
- Public launch to a warm list of creators.

**Exit criterion:** 10 paying creators, each running at least 4 streams/month through Tidal.

## 10. Metrics

**North-star:** Number of fans called out via a Tidal nudge who convert (Super Chat, membership) within 7 days.

**Supporting metrics:**
- Daily active streamers
- % of connected channels whose last live stream was successfully captured
- Nudge action rate (nudges surfaced → nudges acted on)
- Conversion lift: monetization rate of nudged fans vs. non-nudged comparable fans
- Score quality: user feedback thumbs-up/down on ranked fans

## 11. Risks & open questions

**Risks**
- **API quota.** Scaling to many concurrent broadcasts may blow past default quotas. Mitigation: request increase early, add smart polling backoff, batch where possible.
- **Creepiness.** Surfacing "this person is likely to pay you if you flatter them" can feel gross. Framing matters — we emphasize gratitude and relationship, not manipulation. Worth a values doc.
- **YouTube ToS.** Storing chat content about third parties has limits. Legal review before launch.
- **Scoring defensibility.** A bad top-20 list in front of a creator kills trust on day one. Invest early in evals.
- **Platform risk.** If YouTube ships a native equivalent, we're in trouble. Multi-platform is our hedge, but not for v1.

**Open questions**
- How do we handle channels that rarely go live (say, once a month)? Scoring decay?
- Do we want to surface non-chat signals (likes, comments on VODs) in v1, or strictly live chat?
- How do we treat bots / mods / the streamer's own alt accounts?
- Should the companion view live as a browser extension, OBS dock, or standalone web page? (Lean: start with standalone web page; evaluate OBS dock in Phase 4.)
- Pricing: flat monthly vs. percentage of tracked Super Chat revenue?

## 12. Appendix — "what we're explicitly punting"

For our own sanity, so we don't argue about these every week:

- Multi-platform (Twitch / Kick / TikTok)
- Off-platform monetization (Patreon, Ko-fi, Discord tiers)
- Fan CRM features (notes, tags, custom fields) — probably post-launch
- Automated messaging to fans — never without a lot more thought
- Sentiment analysis as a scoring signal — heuristic-only for v1
- Team accounts / moderator access
- Mobile app
- Analytics for non-live content

---

*This is a living document. Update in place; don't fork.*
