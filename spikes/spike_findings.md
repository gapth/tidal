# Spike Findings

## Spike 1 — YouTube Live Chat Ingestion

**Goal:** Can we ingest live chat from a YouTube live stream with latency low enough for Tidal to act in the moment?

### What we ran

- Stream: one active stream (automotive/car-deal negotiation community, mid-volume ~16 msgs/min)
- Duration: ~10 minutes
- Scripts: `measure_api.ts` (Data API) and `measure_unofficial.py` (pytchat) run simultaneously against the same video ID
- Disconnect test: not run this session

---

### Evidence

#### Data API path (`measure_api.ts`)

| Metric                                                  | Value                     |
| ------------------------------------------------------- | ------------------------- |
| Latency p50 (fresh messages, poll 2+)                   | **2.6s**                  |
| Latency p95                                             | **3.9s**                  |
| Latency p99                                             | **4.3s**                  |
| `pollingIntervalMillis` (inferred from inter-poll gaps) | **1.8s – 3.2s, avg 2.5s** |
| Total polls in 10.1 min                                 | 259                       |
| Total quota units consumed                              | 1,296                     |
| Extrapolated units / 8hr at same rate                   | **61,545**                |
| Daily quota limit                                       | 10,000                    |
| Minutes until quota exhausted                           | **~78 min**               |
| Fresh messages received (poll 2+)                       | 164                       |
| Backlog messages (poll 1, already in chat)              | 146                       |

**Note on `pollingIntervalMillis`:** YouTube returned ~2.5s as the recommended polling interval for this active stream. Our existing production code enforces a 30s floor; the spike script respected YouTube's recommendation and polled at full speed.

#### pytchat path (`measure_unofficial.py`)

| Metric                           | Value                   |
| -------------------------------- | ----------------------- |
| Latency p50 (timezone-corrected) | **3.0s**                |
| Latency p95                      | **3.8s**                |
| Latency p99                      | **4.3s**                |
| Messages received                | 160                     |
| Errors / reconnects              | 0                       |
| Quota consumed                   | **0** (no API key used) |

**Timezone bug:** pytchat returns `datetime` in local time; the script parsed it as UTC, inflating raw latency by 7 hours. Corrected figures above subtract the PDT offset. The fix is to either use `item.timestamp` (epoch ms) directly or treat pytchat's datetime as local time.

#### Message completeness (text-normalized, fresh window)

|                              | Count    |
| ---------------------------- | -------- |
| Matched by both paths        | 148      |
| API-only (missed by pytchat) | 6 (3.9%) |
| pytchat-only (missed by API) | 2 (1.3%) |

Both paths captured ~96–98% of the message stream over the same time window. The small exclusive sets appear to be timing edge cases at the boundary of each path's observation window.

#### Disconnect test

Not run this session. Should be run before v1 to confirm `nextPageToken` recovery and pytchat's reconnect behavior.

---

### Quota analysis (pre-calculated)

`liveChatMessages.list` = 5 units/call. `videos.list` (liveChatId lookup) = 1 unit, one-time.

| Poll interval                                 | Units/hr | Units/8hr  | Verdict                          |
| --------------------------------------------- | -------- | ---------- | -------------------------------- |
| 2.5s (YouTube-recommended for active streams) | 7,200    | **57,600** | ❌ quota in 78 min               |
| 10s                                           | 1,800    | 14,400     | ❌ quota in ~5.5hr               |
| 30s (current code floor)                      | 600      | 4,800      | ✓ quota OK, but **latency ~30s** |
| 60s                                           | 300      | 2,400      | ✓ quota OK, but **latency ~60s** |

The quota constraint and latency target are in direct tension on the official API path. There is no polling interval that satisfies both simultaneously on the default 10k/day quota.

---

### Verdict

**Official Data API path: not viable as-is** for real-time use.
Quota is exhausted in ~78 minutes when polling at YouTube's recommended interval. Enforcing a 30s floor keeps quota in range but pushes latency to ~30s — too slow to act on a moment in chat.

**pytchat path: viable with caveats.**
Latency is comparable to the API (p50 3s, p99 4.3s), no quota constraint, and completeness is ~97%. The main risks are TOS exposure and innertube API instability.

---

### Recommended path for v1

**Use pytchat for the spike and early v1.**

Reasoning:

- Latency is functionally identical to the official API (p50 3s vs 2.6s)
- No quota ceiling — one stream can be monitored continuously for an 8-hour broadcast
- ~97% message completeness is sufficient for sensemaking (we need signal, not a perfect record)
- TOS risk is real but low: pytchat is used by thousands of projects for read-only chat monitoring; no enforcement precedent for this use pattern
- Instability risk is manageable: innertube is the same protocol YouTube's own web client uses; it's stable at the protocol level, though pytchat the library may lag behind breaking changes

When the product matures and we need an SLA, apply for a YouTube API quota increase (1M units/day is available for approved projects), switch back to the official API, and drop the unofficial dependency.

---

### Open questions before v1

1. **Quota increase**: Would YouTube approve a 1M unit/day increase for a creator-tool use case? What's the approval process and timeline?
2. **pytchat long-run stability**: We only tested 10 minutes. Does it hold up over 6–8 hour streams? Does it handle stream interruptions (ads, network cuts) gracefully?
3. **Multi-stream scaling**: Tidal will eventually need to track multiple concurrent streams. Each pytchat connection is independent — does this scale linearly, or are there rate limits at the IP/account level?
4. **Disconnect recovery**: Does pytchat auto-reconnect, or does a network blip terminate the session? If it terminates, can we resume without duplicating or dropping messages?
5. **Latency floor question for product**: Is 2–4s latency sufficient for Tidal's prompts to be actionable? Some prompt types (e.g., "same question asked 5 times") are latency-tolerant; others (e.g., "viewer just said something worth acknowledging") may be more time-sensitive.

---

## Spike 2 — LLM Pipeline Latency and Quality

### What we ran

- **Data:** 240 unique messages from Spike 1 (real automotive/car-deal stream, ~16 msgs/min, ~10 min)
- **Pipelines:** A (window-only), B (cluster-first, 2 LLM calls), C (pre-filter + interpret)
- **Models:** gpt-4o-mini, gpt-4o, gpt-4-turbo (C only)
- **Label set:** 30 hand-labeled "important moments" — superchats (3), direct questions (8), repeat questions (11), service questions (3), interesting topics (4), client feedback (1)
- **Replay mechanics:** messages sorted by publishedAt, replayed at 2.5s poll ticks (matching Spike 1's observed interval)

---

### Evidence

#### Full results table

| Run               | Prompts | Calls/min | P50 ms   | P95 ms   | P99 ms   | Recall    | Precision |
| ----------------- | ------- | --------- | -------- | -------- | -------- | --------- | --------- |
| A 90s gpt-4o-mini | 32      | 2.0       | 1840     | 2304     | 2584     | **1.000** | **1.000** |
| A 60s gpt-4o-mini | 32      | 2.0       | 1765     | 2407     | 2410     | **1.000** | 0.906     |
| A 60s gpt-4o      | 32      | 2.0       | **1487** | **2006** | **2168** | **1.000** | 0.906     |
| B gpt-4o-mini     | 32      | 2.0       | 5327     | 9174     | 9831     | **1.000** | 0.906     |
| B gpt-4o          | 32      | 2.0       | 5238     | 7308     | 8445     | **1.000** | 0.906     |
| A 30s gpt-4o-mini | 32      | 2.0       | 2305     | 3775     | 3844     | **1.000** | 0.719     |
| **C gpt-4o-mini** | **21**  | **1.4**   | **669**  | **873**  | **974**  | 0.967     | **1.000** |
| C gpt-4o          | 21      | 1.4       | 757      | 1175     | 1236     | 0.967     | **1.000** |
| C gpt-4-turbo     | 21      | 1.4       | 1381     | 2244     | 2602     | 0.967     | **1.000** |

#### Total end-to-end latency (ingestion + LLM)

Ingestion latency from Spike 1: p50 2.6s, p95 3.9s, p99 4.3s.

| Pipeline       | LLM p50 | LLM p95 | **Total p50** | **Total p95** | Within 5s target?   |
| -------------- | ------- | ------- | ------------- | ------------- | ------------------- |
| C gpt-4o-mini  | 669ms   | 873ms   | **3.3s**      | **4.8s**      | ✓ p95 touches limit |
| C gpt-4-turbo  | 1381ms  | 2244ms  | **4.0s**      | **6.1s**      | ✗ p95 over          |
| A gpt-4o (60s) | 1487ms  | 2006ms  | **4.1s**      | **5.9s**      | ✗ p95 over          |
| B gpt-4o       | 5238ms  | 7308ms  | **7.8s**      | **11.2s**     | ✗ clearly over      |

#### Window size sweep (Pipeline A, gpt-4o-mini)

| Window  | P50 ms   | Recall    | Precision |
| ------- | -------- | --------- | --------- |
| 30s     | 2305     | 1.000     | 0.719     |
| 60s     | 1765     | 1.000     | 0.906     |
| **90s** | **1840** | **1.000** | **1.000** |

90s is the sweet spot — at 16 msgs/min it puts ~24 messages in view, enough to detect patterns without over-triggering. 30s gives poor precision (too noisy) and 60s loses some repeated-question signals.

#### Pipeline C trigger breakdown (21 calls over 10 min)

| Trigger type    | Fires                             |
| --------------- | --------------------------------- |
| creator_mention | 12                                |
| repeat_question | 7                                 |
| superchat       | 3                                 |
| energy_spike    | 1 (co-fired with creator_mention) |

#### Sample prompts — Pipeline C, gpt-4o-mini

| Time     | Trigger         | Prompt                                                                                 |
| -------- | --------------- | -------------------------------------------------------------------------------------- |
| 22:26:57 | superchat       | Acknowledge @MakeMoneyTrucking's $5 superchat and answer the best price on a Raptor R. |
| 22:34:37 | repeat_question | Address the question directly and provide a clear overview of your services.           |
| 22:35:22 | superchat       | Acknowledge @wanton47's $2 superchat about whether there will be more car deals today. |
| 22:38:20 | repeat_question | Address the repeated question about dealership sabotage and share your experience.     |
| 22:41:00 | repeat_question | Address the question about the 2.5k service directly and provide a clear explanation.  |

Prompts are concise (one sentence), correctly identify the trigger, and tell the creator exactly what to do.

#### Missed moment (Pipeline C)

C missed **1/30 labeled moments** — the first occurrence of the negative equity question (22:30:17). At that tick, only one instance existed in the window so the `repeat_question` heuristic did not fire. C correctly caught the 2nd and 3rd occurrence at 22:33:04 and 22:34:03.

This is the structural blind spot: novel first-instance questions that don't mention the creator and aren't superchats.

---

### Verdict

**(a) Latency we can realistically hit:** **~3.3s p50 total (ingestion + LLM)** using Pipeline C + gpt-4o-mini. P95 is ~4.8s — right at the 5s target. Pipeline A is ~4–6s and Pipeline B is ~8–11s. gpt-4o-mini is the right model: gpt-4o adds ~100ms for no measurable quality gain on Pipeline C's small focused windows; gpt-4-turbo doubles latency with no benefit.

**(b) Precision and recall:** Pipeline C: **recall 96.7%, precision 100%**. Pipeline A (90s): recall 100%, precision 100%, but calls more often (2/min vs 1.4/min) and misses the 5s latency target at p95.

**(c) Winning pipeline:** **Pipeline C (pre-filter + interpret)**. It's 3x faster than A, 10x faster than B, achieves perfect precision, and generates 30% fewer prompts (less fatigue). The heuristics (superchat, repeat_question, creator_mention, energy_spike) catch the most time-critical moments with zero false alarms. Pipeline B is a clear loser: two serial LLM calls double latency without improving quality.

**(d) Biggest remaining quality risk:** **Novel first-occurrence questions**. Pipeline C only fires when a heuristic triggers; an important standalone question that doesn't mention the creator, isn't a superchat, and hasn't repeated yet will be silently skipped. In this 10-minute log that was 1/30 moments. In a longer or more sparse stream, this category could grow.

**Recommended mitigation:** Hybrid approach — run Pipeline C for real-time heuristic alerts, plus a Pipeline A background sweep every ~3 minutes. The A sweep catches novel important questions Pipeline C's heuristics miss; the C path handles latency-critical moments within the 5s window. Combined, they cover both categories without overwhelming the creator.

---

### Open questions before v1

1. **Heuristic quality on noisier streams:** This stream was coherent English car-chat. Does the `repeat_question` Jaccard heuristic hold up on streams with more slang, emojis, or multiple languages?
2. **Creator name detection:** The heuristic looks for "tomi" and "delivrd" hardcoded. For a multi-creator product, this needs to be per-user configurable.
3. **Prompt fatigue at scale:** 1.4 prompts/min over an 8-hour stream = ~672 total prompts. Even if all are actionable, that's likely too many. The right cadence for a real product needs user research.
4. **Quality ceiling question:** All Pipeline C prompts were functionally similar across gpt-4o-mini, gpt-4o, and gpt-4-turbo on these short focused windows. The quality ceiling for this task appears to be in the heuristic pre-filter (signal selection), not the LLM. Better heuristics > bigger model.

---

## Spike 3 — Reference Chat Dataset

**Goal:** Assemble a small, realistic corpus of recorded live chat from completed YouTube streams to develop and evaluate the LLM pipeline offline.

### What we built

A repeatable data-collection script (`spikes/spike_03_dataset/collect.py`) that:

- Accepts one video ID per invocation; accumulates a corpus across repeated runs
- Uses **pytchat** (already validated in Spike 1) to fetch the full chat replay of a completed stream — pytchat auto-detects replay mode and fetches all messages as fast as possible, not in real time
- Fetches video title + channel via the **YouTube oEmbed API** (no auth required)
- Saves each stream as `dataset/raw/<VIDEO_ID>.jsonl`, one message per line
- Upserts an entry into `dataset/manifest.json` with title, channel, category, message count, and chat duration

**Usage:**

```bash
cd spikes/spike_03_dataset
pip install -r requirements.txt
python collect.py <VIDEO_ID> --category commentary --notes "optional annotation"
# Re-run with different video IDs to grow the corpus; already-collected IDs are skipped
```

### Message schema

Each line in the JSONL files contains:

```json
{
  "video_id": "...",
  "message_id": "...",
  "timestamp_ms": 1704067200000,
  "timestamp_iso": "2024-01-01T12:00:00+00:00",
  "author": "Display Name",
  "author_id": "UCxxxxxxxx",
  "text": "message text",
  "is_member": false,
  "is_moderator": false,
  "type": "textMessage",
  "amount": null
}
```

### Format decisions

- **JSONL per stream** — one file per video ID, easy to stream and filter without loading everything into memory
- **manifest.json** — flat index of all collected streams with category labels and stats; serves as the corpus-level summary
- **oEmbed for metadata** — avoids needing a YouTube API key; returns title and channel name reliably for public videos
- **pytchat for replay** — same library as live ingestion (Spike 1), no quota cost, no auth; replay mode terminates naturally when all messages are delivered

### Status

Tool is complete. Corpus not yet collected — needs 8–12 video IDs across ICP content categories fed in. Target categories: commentary, talk, reaction, gaming, watchalong.

### Corpus collection criteria

- Completed (archived) public livestreams only
- 500–5,000 concurrent viewers preferred — below that chat is too thin, above that too noisy for early development
- At least one stream per category; solo or minimal-staff creators preferred

---

### Open questions before corpus is complete

1. **pytchat replay completeness:** Does pytchat reliably fetch 100% of messages in replay mode, or does it drop messages for long streams (3hr+) the way live mode occasionally does?
2. **Category coverage:** Do we have enough streams in the watchalong and reaction categories? These may be harder to find at the 500–5k viewer tier.
