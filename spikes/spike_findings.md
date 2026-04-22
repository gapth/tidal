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

## Spike 2 — LLM Quality

_Not yet run_

## Spike 3 — Signal Extraction from Noisy Chat

_Not yet run_
