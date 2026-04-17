/**
 * Shared polling utilities used by ingest_video.ts and ingest_channel.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveChatMessages,
  normalizeRawMessages,
  type YouTubeChatResponse,
} from "@/lib/youtube";
import { upsertFansAndMessages } from "@/lib/db";

type ChatResponseWithPolling = YouTubeChatResponse & {
  pollingIntervalMillis?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const ERROR_BACKOFF_MS = 15_000;

export function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sleeps for `ms` but checks the shutdown flag every second so Ctrl+C is
// handled promptly instead of waiting for the full sleep to expire.
export async function interruptibleSleep(
  ms: number,
  isShuttingDown: () => boolean,
): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (isShuttingDown()) return;
    await sleep(1_000);
  }
}

// Polls a live chat until the stream ends or shutdown is requested.
// Returns the total number of messages written to the DB.
export async function pollBroadcastUntilEnd(opts: {
  liveChatId: string;
  videoId: string;
  apiKey: string;
  supabase: SupabaseClient;
  ownerId: string;
  isShuttingDown: () => boolean;
}): Promise<number> {
  const { liveChatId, videoId, apiKey, supabase, ownerId, isShuttingDown } =
    opts;

  let nextPageToken: string | undefined;
  let totalMessages = 0;

  while (!isShuttingDown()) {
    try {
      const raw = (await getLiveChatMessages(
        liveChatId,
        apiKey,
        nextPageToken,
      )) as ChatResponseWithPolling;

      const pollIntervalMs =
        raw.pollingIntervalMillis ?? DEFAULT_POLL_INTERVAL_MS;
      nextPageToken = raw.nextPageToken;

      const messages = normalizeRawMessages(raw.items);

      if (messages.length > 0) {
        await upsertFansAndMessages(supabase, messages, videoId, ownerId);
        totalMessages += messages.length;
        console.log(
          `[${timestamp()}] +${messages.length} messages (${totalMessages.toLocaleString()} total)`,
        );
      } else {
        console.log(`[${timestamp()}] (no new messages)`);
      }

      // YouTube signals stream end: no next page token and no items returned.
      if (!nextPageToken && (!raw.items || raw.items.length === 0)) {
        console.log(`[${timestamp()}] Stream ended.`);
        break;
      }

      await interruptibleSleep(pollIntervalMs, isShuttingDown);
    } catch (err) {
      console.error(
        `[${timestamp()}] Poll error: ${(err as Error).message} — retrying after ${ERROR_BACKOFF_MS / 1000}s`,
      );
      await interruptibleSleep(ERROR_BACKOFF_MS, isShuttingDown);
    }
  }

  return totalMessages;
}
