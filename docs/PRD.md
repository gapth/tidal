# Tidal — Product Requirements Document (v0.1)

**Owner:** Gap
**Status:** Draft, expect revisions
**Last updated:** 2026-04-21
**Audience:** Internal founding team

---

## 1. Summary

### 1.1 Mission

Tidal helps live streamers recognize the fans who keep showing up. We surface the loyal regulars the chat buries — so creators can reward them on-stream and turn consistent presence into lasting support.

### 1.2 Jobs to be done

**Main job.** When I'm live and chat is moving faster than I can track, I want to recognize and reward the fans who show up for me consistently — in the moment, while I'm streaming — so my community feels seen and supports me in return.

**Functional jobs,** in order of priority. The product's center of gravity is #1; the others exist to make #1 work without demanding effort outside stream time.

1. **In-stream recognition.** When I go live, I want to know which fans currently in chat are long-time regulars, so I don't default to thanking only the loudest or the already-paying. _(Primary — this is the product's differentiation.)_
2. **Silent preparation.** When I'm not streaming, I want Tidal to quietly work on what it already knows from my last stream — refining scores, letting stale signals fade, readying the next set of prompts — so it's ready to help the moment I go live again, without me having to do anything.
3. **Zero-config readiness.** When I'm about to start a stream, I want Tidal to be ready without configuration or review, so I can focus on the stream itself.
4. **Optional reflection.** When a stream ends, I want a lightweight summary of who I recognized and how it landed — but I shouldn't have to open it to benefit.

**Emotional jobs.**

- I want to feel fair to my community — not like I'm rewarding only the people who happened to yell loudest.
- I want to feel present on stream, not mentally juggling a spreadsheet of names.
- I want to feel my revenue reflects real relationships, not extraction.

**Social jobs.**

- I want to be known as a creator who notices people — the one whose community feels like a place, not a funnel.

**Product principle that falls out of this.** Tidal lives _during_ the stream and runs silently the rest of the time. Every ask of the creator outside of streaming hours is a cost to be justified.

### 1.3 Product overview

Our first wedge is **YouTube live streamers**, who already have monetization surfaces (Super Chat, channel memberships, gifted memberships) but lack the tooling to know _which_ loyal viewers deserve a moment of recognition — and no way to act on that knowledge while chat is moving.

We ingest live chat activity, build a per-fan profile over time, score each fan's loyalty and likelihood-to-convert, and surface actionable prompts in a live companion view while the creator streams. A between-stream dashboard exists to build trust in the scoring and support reflection, but the product lives _during_ the broadcast.

## 2. Strategy

### 2.1 Why this, why now

Four market shifts make Tidal plausible in 2026 in a way it wasn't two years ago.

First, **Twitch lifted simulcast restrictions in October 2023.** Before then, Twitch Partners were contractually barred from streaming simultaneously to other platforms. The multi-platform creator at scale is a post-2023 phenomenon — the market we bet on didn't exist in its current form until recently.

Second, **multi-streaming tool adoption grew ~35% in 2024.** Restream, StreamYard, and Castr usage spiked after the Twitch policy change. Streamlabs' Q3 2024 report called simulcasting "non-negotiable" for creators competing in a fragmenting landscape.

Third, **monetization surfaces across live platforms matured.** YouTube's Super Chat and membership APIs, Twitch's Bits and subscription events, Kick's subscriptions and tipping — all expose structured monetization events via official APIs. Real per-stream revenue justifies a dedicated CRM layer.

Fourth, **lightweight language signal got cheap.** LLMs make intent detection, question identification, and direct-address classification tractable without an ML team or infra. We can enhance a transparent heuristic score with language understanding that would have required specialized investment a year ago.

### 2.2 Wedge — YouTube live, mid-tier, recurring, solo

Our beachhead is mid-tier (1K–500K subscribers) YouTube live streamers who broadcast at least weekly and operate solo or with minimal support staff. Recurring cadence is a precondition for the product working at all — our scoring depends on multi-stream observation.

**Why YouTube first.** The honest reason is logistical: we can recruit friendly YouTube creators faster than Twitch/Kick ones, and the YouTube Data API (including `liveChatMessages.list`) is mature and permissive enough to build on. There is a strategic layer on top — YouTube is a common _secondary_ platform for Twitch-primary creators, which gives us a Trojan-horse path into the Twitch-primary segment once we add Twitch support. YouTube's structured monetization (explicit Super Chat amounts, clear membership events) also lets us validate scoring against real revenue outcomes from day one.

**Why not Twitch first.** Twitch has a more mature tool ecosystem (Streamlabs, StreamElements, Streamer.bot), raising the differentiation bar at launch. We also have thinner creator access there. Twitch is the right second platform, not the right first.

**Why not Kick or TikTok.** Kick has a real API but a smaller creator base concentrated in specific niches (gaming, regional) — a later addition. TikTok Live has no official chat API; third-party tools rely on reverse-engineered WebSocket scraping that is ToS-hostile and brittle. TikTok Live is explicitly excluded from our roadmap — rationale in §2.7.

**ICP scope: broad with targeted messaging.** We serve all mid-tier YouTube live streamers who meet the cadence threshold, whether they're currently single-platform or primary-plus. We pitch the in-stream recognition story to the single-platform segment and the cross-platform memory story to primary-plus creators. One product, two narratives — depending on who we're talking to.

### 2.3 Positioning

**Tidal is the cross-platform relationship memory for live streamers.** We start on YouTube; we're architected multi-platform from the data model up.

We are not:

- an overlay or alert tool (Streamlabs, StreamElements operate on _events_; we operate on _people_)
- a chatbot or automation tool (we never message fans on the creator's behalf)
- a VOD analytics tool (YouTube Studio, VidIQ, TubeBuddy serve that market)
- a tool for brand / corporate channels
- a tool for mega-creators with managers or dedicated community teams

Who we beat:

- **The status quo.** The creator's own memory plus their mod's pinned note. This is the primary competitor. We win when a creator who would have shouted out the loudest chatter shouts out the most loyal one instead.
- **Streamlabs / StreamElements and peers.** They alert on events, not relationships. Complementary, not replaceable — creators can run both.
- **Native platform UI (YouTube Studio, Twitch dashboard).** Shows the firehose, not the people who matter.

### 2.4 Core bet and moat

**The bet.** The dominant creator pattern is "primary-plus" — one main platform with simulcast to 1–2 others — and Tidal is the only tool that gives a creator a single pane of glass on all their live-stream audiences. Each platform's audience stays siloed (we never infer that two accounts across platforms are the same person), but the creator sees one workflow across everywhere they go live: prepare, recognize, reflect — regardless of which platform they're on today. Workflow consolidation itself is the value; identity stitching is not the bet.

**The moat compounds two ways.**

1. **Fan-memory longitude, per platform.** The longer a creator uses Tidal, the deeper our per-fan memory on each platform they stream to — attendance, chat history, monetization, direct-address moments. Switching to a competitor means starting from zero on every platform.
2. **Trust and platform compliance.** We respect every platform's ToS — no persistent cross-platform user profiling, no inferred identity linking, no data resale, no opaque scoring. Competitors that race to the bottom on viewer tracking lose API access. Creators don't switch to a tool that could one day cost them their integration.

**Optional: creator-declared cross-platform linking.** A creator who recognizes the same person on two platforms can tag them manually. Tidal then surfaces the combined history, but the link is creator-asserted, never inferred by us. Extends the product's value without crossing ToS lines. Implemented only if creators ask for it.

**What we're betting against.** A well-resourced single-platform competitor (a Streamlabs feature, a Twitch-native tool, or an upstart) entrenching before we ship multi-platform. We think the post-October-2023 window is open and adoption is active — but we could be wrong, and we have ~18 months before first-mover advantage on Twitch starts to bite.

**Counter-signals we respect.** Multi-streaming is growing but not universal. Some top creators (TimTheTatman, Dr Lupo) re-consolidated to Twitch after their exclusivity contracts ended. Kick's 2024 growth was fueled partly by single-platform regional deals. Not everyone multi-streams; our bet is that _enough_ mid-tier creators do, and that the share is growing.

### 2.5 Business model

**Freemium plus paid unlock.**

- **Free tier.** One connected channel (any supported platform), full in-stream companion view, basic scoring, 90-day history retention.
- **Paid tier.** Multiple connected channels (including across platforms as we add them), extended history retention, email digest, advanced nudge types, post-stream recap with attribution analytics.

Pricing specifics (monthly vs annual, exact $) deferred to Phase 5. Principle: anchor the free tier on the thing we want to spread — the in-stream moment — and make the paid tier align naturally with the multi-platform moat.

Subscription is the only structurally viable model. Every major platform's developer ToS (YouTube, Twitch, Kick) restricts selling raw chat data, viewer rosters, or derivative analytics as standalone products. We can charge creators for _tools_ that use their audience data, as long as the value is in the tool and not in the data commodity.

Attribution-based pricing (% of tracked Super Chat or membership revenue) is rejected for v1. Three reasons: (a) it creates perverse incentives to optimize for conversion over relationships, undermining the mission; (b) it requires attribution infrastructure out of scope for v1; (c) it reframes us as a growth-hack tool, at odds with positioning. Revisit only if freemium economics fail.

### 2.6 Go-to-market

Two channels, both founder-driven, explicitly _not_ betting on referral loops or partner distribution in v1.

**Direct founder outreach (Phase 0–3, primary).** Hand-recruit the first 30–50 creators via DMs, emails, warm intros, and relevant events where affordable. Every early creator is also a feedback source — we learn faster from them than from any dashboard. Target: 10 paying creators by end of Phase 5.

**Content and SEO (compounding, starts Phase 3).** Brand-led content under a platform-agnostic angle: not "YouTube live streaming tips" (too narrow, indistinguishable from existing creator advice) but _what loyalty looks like in chat data_ and _the economics of being noticed_. Topics like "why your regulars don't Super Chat," "the half-life of a Super Chatter," "what chat velocity tells you about community depth." Positions Tidal as the thought leader on live-stream audience relationships and compounds over 12–18 months. It's the only path to Phase 6+ growth without viral loops we're not yet building.

We explicitly decline:

- Creator-to-creator referral as a plan (unavoidable if it happens naturally, but not load-bearing).
- Partnerships with other creator tools (adds dependency, slows iteration).
- Paid acquisition (low intent for creator tools; unknown CAC).

**Known gap.** Founder outreach saturates around ~50 creators; content compounds slowly. There's a Phase 4–5 growth gap we'll revisit when we have a "moment worth sharing" (e.g., first Super Chat attributed to a Tidal nudge). Flagged, not solved.

### 2.7 Compliance as strategy

Platform ToS is not a pre-launch legal task — it's a design constraint that shapes decisions upstream.

- **Storage is minimally necessary.** 90-day rolling retention for raw chat messages; aggregated signals (per-fan scores, counts, profile records) retained while the creator is a customer plus 30 days after disconnect.
- **Deletion on request is a first-class flow.** Viewer-initiated deletion requests propagate within 30 days. Creator disconnect triggers scheduled deletion of all associated data.
- **No cross-creator data sharing.** Each creator's data is siloed. No ML models trained across customer data. No aggregated audience products, ever.
- **No cross-platform identity inference.** Fan profiles are scoped to the platform they were observed on. We never infer that two accounts across platforms are the same person. Creators may manually assert links; Tidal never asserts them on the creator's behalf.
- **Subscription model only.** Our revenue comes from creator tools. Platform-sourced data is inside the tool, never the product.
- **No scraping when an API exists.** We integrate via official OAuth APIs on every platform that has one. TikTok Live — with no official chat API — is excluded from our roadmap. Re-examine only if TikTok publishes an official API.

This posture is not only compliance hygiene. It's the moat against competitors who race to the bottom on viewer profiling and lose platform access. Trust compounds — see also kill conditions in §2.8.

### 2.8 Explicit bets, non-negotiables, and kill conditions

**We bet that:**

- The primary-plus creator pattern is common and growing among mid-tier live streamers.
- Creators value "one CRM for all my streams" even when per-platform fan profiles stay siloed — workflow consolidation alone is worth the switch.
- Creators will pay for relationship tools and in-stream attention support, not standalone analytics.
- Platform ToS posture stays in roughly current shape across the 18–24 months we need to establish moat.

**We are not:**

- an overlay or alert tool
- a chatbot or automation product
- a VOD analytics tool
- a tool for brand or corporate channels
- a tool for mega-creators with managers or teams

**We will not:**

- Automate messaging to fans on the creator's behalf.
- Use opaque or black-box scoring — every score carries a transparent "why."
- Build cross-creator viewer profiles, even internally.
- Ship features that demand creator attention outside of streaming hours.
- Scrape any platform that offers an API.
- Infer that two accounts on different platforms belong to the same person — cross-platform linking is creator-declared, never automatic.
- Support TikTok Live until it has an official API and a compliance path.

**Kill conditions** (any one triggers strategic re-evaluation, not automatic shutdown):

- YouTube or Twitch ships a first-party equivalent and it's genuinely good.
- Our API access is revoked due to a compliance audit failure on any platform.
- Freemium economics don't work at 100 paying creators.
- The primary-plus pattern turns out materially smaller or shrinking faster than believed.

---

_Downstream sections (problem statement, target user, goals & non-goals, user journeys, feature specs, infrastructure, technical approach, development plan, metrics, risks, appendix) have been removed pending further discussion. They'll be rewritten to flow from the mission, JTBD, and strategy above once those upstream decisions are settled._

_This is a living document. Update in place; don't fork._
