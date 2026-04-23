# Spike 2 — LLM Pipeline Latency and Quality

## Goal

Can an LLM pipeline take a stream of chat messages and produce useful "what matters right now" prompts within 5 seconds?

## Data

Real chat from Spike 1 (`../spike_01_ingest/results_api.jsonl`): 310 messages, 240 unique after deduplication, from a live automotive/car-deal negotiation stream (~16 msgs/min, ~10 min).

## Setup

```bash
npm install openai          # already added to package.json
# add OPENAI_API_KEY to .env.local
```

## Running

```bash
# Run all pipeline configurations (8 runs, ~15-20 min)
npx tsx --env-file=.env.local spikes/spike_02_llm/harness.ts

# Evaluate results against hand-labeled set
npx tsx --env-file=.env.local spikes/spike_02_llm/evaluate.ts

# Run heavy model on winning pipeline (after evaluate picks a winner)
npx tsx --env-file=.env.local spikes/spike_02_llm/harness.ts --heavy A
```

## Pipelines

### A — Window-Only

Rolling window of last N seconds → single LLM call.
Trigger: ≥5 new messages AND ≥25s simulated elapsed since last prompt.
Tested at 30s / 60s / 90s window with gpt-4o-mini; then 60s with gpt-4o.

### B — Cluster-First (two LLM calls)

Call 1 (gpt-4o-mini): group window into topic clusters.
Call 2 (target model): pick which cluster Tomi should address now.
Tested with gpt-4o-mini and gpt-4o as the second-call target.

### C — Pre-filter + Interpret

Heuristics scan every tick (no LLM cost):

- `superchat`: message starts with `$X.XX from @`
- `repeat_question`: 2+ messages in window with Jaccard word-overlap ≥ 0.4
- `creator_mention`: message contains "tomi" or "delivrd", length > 20
- `energy_spike`: ≥4 new non-bot messages this tick

Only calls LLM when a heuristic fires (12s cooldown between calls).

## Models

| Tier     | Model       | Notes                       |
| -------- | ----------- | --------------------------- |
| Fast     | gpt-4o-mini | Primary cheap/fast tier     |
| Balanced | gpt-4o      | Main quality tier           |
| Heavy    | gpt-4-turbo | One run on winning pipeline |

## Label Set

`label_set.json`: 30 hand-labeled important moments across the 10-minute log.
Categories: superchat (3), direct_question (8), repeat_question (11), service_question (3), interesting_topic (4), client_feedback (1).

Key patterns: the "dealership sabotage" question appears 6 times; the "$2.5k service" question appears 5 times. Good test of repeat-detection heuristics.

## Evaluation Metrics

- **Recall**: labeled moments covered by a triggered window / total labeled moments
- **Precision**: triggered windows that cover ≥1 labeled moment / total triggered windows
- **Latency p50/p95/p99**: wall-clock time of LLM calls
- **Total latency**: ingestion (2-4s from Spike 1) + LLM latency above
- **Calls/min**: rate of prompts emitted

## Files

```
types.ts        — shared type definitions
replay.ts       — load/dedup messages, build ticks and windows
label_set.json  — 30 hand-labeled moments
pipeline_a.ts   — window-only LLM call
pipeline_b.ts   — two-call cluster+prioritize
pipeline_c.ts   — heuristic pre-filter + LLM
harness.ts      — orchestrates all runs, writes results/*.jsonl
evaluate.ts     — computes precision/recall, writes results/summary.md
results/        — created at runtime
```
