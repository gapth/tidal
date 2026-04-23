# Hybrid Pipeline Run Report

**Corpus:** 1 stream(s), 1,665 messages total, 41 min

---

## Aggregate Metrics

| Metric | Value |
|--------|-------|
| Total prompts | 0 |
| Pipeline C prompts | 0 |
| Pipeline A prompts | 0 |
| A candidates suppressed by dedup | 0 |
| Prompts / min (overall) | 0.00 |
| Total LLM calls | 0 |
| Estimated cost | $0.0000 |

**Prompts by category:**


## Latency Distribution

| Pipeline | p50 | p95 | p99 |
|----------|-----|-----|-----|
| C (heuristic + LLM) | n/a | n/a | n/a |
| A (periodic sweep) | n/a | n/a | n/a |

*(Latency = wall-clock LLM call duration only. End-to-end adds ~2.5–3s ingestion latency.)*

## C vs A Comparison

### What Pipeline A adds (A-only prompts that survived dedup)

*(No A-only prompts in this run — A was fully covered by C or no sweeps fired.)*

### What Pipeline C adds (monetization events — A would miss these at the right latency)

*(No monetization events in corpus — category works correctly but corpus lacks examples.)*

## Tuning Findings

**Sweep interval:** 180.0s (default). Shorter intervals (90s, 60s) would increase A's recall on novel questions at the cost of more LLM calls and higher false-alarm risk. Longer intervals (300s) reduce cost but may miss time-sensitive novel questions. 180s is a reasonable first default; tune after collecting creator feedback on missed moments.

**A window size:** 180.0s. Matching the sweep interval means each sweep sees exactly the messages since the last sweep — no overlap, no gaps. Widening the window adds context but risks re-surfacing questions C already handled.

**Heuristic thresholds used:**
- repeat_similarity_threshold: 0.82 (cosine sim, text-embedding-3-small)
- repeat_min_authors: 2
- energy_spike_z_threshold: 2.0 (over 30.0s buckets)
- ack_min_len: 150 chars
- llm_cooldown_s: 12.0s

## Per-Stream Summary

| Stream | Messages | Duration | Total | C | A | /min | Categories |
|--------|----------|----------|-------|---|---|------|------------|
| G4sJr4-08S8 | 1,665 | 41m | 0 | 0 | 0 | 0.0 | none |

## Known Gaps

- `confusion_cluster`, `sentiment_shift`, `factual_correction`, `stream_quality_issue` are stubbed — returns None until implemented.
- `lingering_question`, `returning_regular`, `topic_drift` are out of v1 scope (require STT or cross-stream memory).
- No labels file found — precision/recall against hand-labeled moments not computed. Add `dataset/labels.json` to enable per-category evaluation.
- Monetization events absent in collected corpus — category is implemented and tested structurally but fire rate is 0.
- Energy spike Z-score needs ~3 baseline buckets (≥90s) before it can fire; events in the first 90s of a stream will be missed.
