/**
 * Spike 1 — Data API path latency measurement
 *
 * Polls a YouTube live chat via the official Data API and logs
 * (text, publishedAt, receivedAt, latencyMs) for every message.
 * At the end it prints summary stats and quota used.
 *
 * Usage:
 *   npx tsx --env-file=../../.env.local spikes/spike_01_ingest/measure_api.ts <VIDEO_ID> [DURATION_MINUTES]
 */

import * as fs from "fs";
import * as path from "path";
import { getActiveLiveChatId, getLiveChatMessages } from "../../lib/youtube";

const VIDEO_ID = process.argv[2];
const DURATION_MINUTES = Number(process.argv[3] ?? 10);

if (!VIDEO_ID) {
  console.error("Usage: measure_api.ts <VIDEO_ID> [DURATION_MINUTES]");
  process.exit(1);
}

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error("YOUTUBE_API_KEY not set");
  process.exit(1);
}

const OUT_FILE = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "results_api.jsonl",
);

type LogEntry = {
  messageId: string;
  text: string | null;
  publishedAt: string;
  receivedAt: number;
  latencyMs: number;
  pollIndex: number;
};

type ChatResponseWithPolling = {
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  items?: Array<{
    id: string;
    snippet?: {
      displayMessage?: string;
      publishedAt?: string;
    };
  }>;
};

async function main() {
  console.log(
    `[measure_api] video=${VIDEO_ID} duration=${DURATION_MINUTES}min`,
  );
  console.log(`[measure_api] fetching liveChatId...`);

  const liveChatId = await getActiveLiveChatId(VIDEO_ID, API_KEY!);
  console.log(`[measure_api] liveChatId=${liveChatId}`);

  const out = fs.createWriteStream(OUT_FILE, { flags: "a" });
  const startMs = Date.now();
  const endMs = startMs + DURATION_MINUTES * 60 * 1000;

  let nextPageToken: string | undefined;
  let pollCount = 0;
  let messageCount = 0;
  let pollIntervalsSeen: number[] = [];
  const latencies: number[] = [];

  while (Date.now() < endMs) {
    const pollStart = Date.now();
    pollCount++;

    let raw: ChatResponseWithPolling;
    try {
      raw = (await getLiveChatMessages(
        liveChatId,
        API_KEY!,
        nextPageToken,
      )) as ChatResponseWithPolling;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[measure_api] poll ${pollCount} error: ${msg}`);
      if (msg.includes("Live chat has ended")) break;
      if (msg.includes("quotaExceeded")) {
        console.error(
          "[measure_api] daily quota exhausted — resets at midnight Pacific. Stopping.",
        );
        break;
      }
      // On transient error, wait 10s and retry with same token (no messages lost)
      const gapStart = Date.now();
      await sleep(10_000);
      console.log(
        `[measure_api] resuming after ${Date.now() - gapStart}ms gap`,
      );
      continue;
    }

    const receivedAt = Date.now();
    nextPageToken = raw.nextPageToken;
    const pollingInterval = raw.pollingIntervalMillis ?? 5000;
    pollIntervalsSeen.push(pollingInterval);

    const items = raw.items ?? [];
    for (const item of items) {
      const publishedAt = item.snippet?.publishedAt ?? new Date().toISOString();
      const latencyMs = receivedAt - new Date(publishedAt).getTime();
      latencies.push(latencyMs);
      messageCount++;

      const entry: LogEntry = {
        messageId: item.id,
        text: item.snippet?.displayMessage ?? null,
        publishedAt,
        receivedAt,
        latencyMs,
        pollIndex: pollCount,
      };
      out.write(JSON.stringify(entry) + "\n");
    }

    const pollDuration = Date.now() - pollStart;
    const waitMs = Math.max(0, pollingInterval - pollDuration);

    console.log(
      `[measure_api] poll=${pollCount} msgs=${items.length} ` +
        `interval=${pollingInterval}ms wait=${waitMs}ms ` +
        `latency=${items.length > 0 ? Math.round(latencies[latencies.length - 1]) + "ms" : "n/a"}`,
    );

    await sleep(waitMs);
  }

  out.end();

  // Summary
  const totalUnits = 1 + pollCount * 5; // 1 for videos.list, 5 per liveChatMessages.list
  const minInterval = Math.min(...pollIntervalsSeen);
  const maxInterval = Math.max(...pollIntervalsSeen);

  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  console.log("\n=== SUMMARY ===");
  console.log(`Messages received:     ${messageCount}`);
  console.log(`Polls made:            ${pollCount}`);
  console.log(`Total quota units:     ${totalUnits}`);
  console.log(
    `Quota at this rate/8h: ${Math.round((totalUnits / DURATION_MINUTES) * 60 * 8)}`,
  );
  console.log(
    `pollingIntervalMillis: min=${minInterval}ms max=${maxInterval}ms`,
  );
  console.log(`Latency p50:           ${Math.round(p50)}ms`);
  console.log(`Latency p95:           ${Math.round(p95)}ms`);
  console.log(`Latency p99:           ${Math.round(p99)}ms`);
  console.log(`Results written to:    ${OUT_FILE}`);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
