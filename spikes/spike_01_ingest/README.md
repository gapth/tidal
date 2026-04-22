# Spike 01 — YouTube Live Chat Ingestion

Measures end-to-end chat latency and quota costs for two ingestion paths.

## Setup

```bash
# Data API path (TypeScript) — uses existing YOUTUBE_API_KEY from .env.local
# no extra install needed

# Unofficial path (Python)
pip install -r spikes/spike_01_ingest/requirements.txt
```

## Running the measurement

Find a live YouTube stream. Run both scripts simultaneously against the same VIDEO_ID in separate terminals.

**Terminal 1 — Data API path:**

```bash
npx tsx --env-file=.env.local spikes/spike_01_ingest/measure_api.ts <VIDEO_ID> [DURATION_MINUTES]
```

**Terminal 2 — Unofficial (pytchat) path:**

```bash
python spikes/spike_01_ingest/measure_unofficial.py <VIDEO_ID> [DURATION_MINUTES]
```

Both default to 10 minutes. Results are appended to:

- `spikes/spike_01_ingest/results_api.jsonl`
- `spikes/spike_01_ingest/results_unofficial.jsonl`

## Disconnect test

Once both scripts are running and receiving messages, kill your WiFi or VPN for ~30 seconds, then restore it. Observe:

- Does the Data API script recover and resume with the same `nextPageToken`?
- Does pytchat reconnect or halt?
- Are any messages duplicated or dropped on resume?

## Comparing results

Each JSONL file has one JSON object per message with fields:
`messageId, text, publishedAt, receivedAt, latencyMs`

To check completeness (messages unique to one path):

```bash
# Extract message IDs from each file
jq -r '.messageId' results_api.jsonl | sort > ids_api.txt
jq -r '.messageId' results_unofficial.jsonl | sort > ids_unofficial.txt
comm -23 ids_api.txt ids_unofficial.txt   # in API only
comm -13 ids_api.txt ids_unofficial.txt   # in pytchat only
```

## What to record in spike_findings.md

- p50 / p95 latency per path
- `pollingIntervalMillis` range returned by YouTube (API path)
- Total quota units consumed and extrapolated 8-hour cost
- Whether pytchat reconnected or crashed on disconnect
- Any messages present in one path but not the other
