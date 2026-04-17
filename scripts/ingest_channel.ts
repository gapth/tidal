/**
 * Monitors a YouTube channel and ingests live chat whenever a broadcast is active.
 * Polls for a live broadcast every 10 minutes; when one is found, ingests it
 * until it ends, then resumes polling.
 *
 * Usage:
 *   npm run ingest_channel -- @ChannelHandle
 *   npx tsx --env-file=.env.local scripts/ingest_channel.ts @ChannelHandle
 *
 * Required env vars:
 *   YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INGEST_OWNER_USER_ID
 */

import {
  getChannelIdFromHandle,
  getActiveBroadcastVideoId,
  getActiveLiveChatId,
} from "@/lib/youtube";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { pollBroadcastUntilEnd, interruptibleSleep, timestamp } from "./_poll";

const REQUIRED_VARS = [
  "YOUTUBE_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INGEST_OWNER_USER_ID",
];

const CHANNEL_POLL_INTERVAL_MS = 10 * 60 * 1_000; // 10 minutes

async function main() {
  const handle = process.argv[2];

  if (!handle) {
    console.error("Usage: npm run ingest_channel -- @ChannelHandle");
    process.exit(1);
  }

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      console.error(`Missing required env var: ${varName}`);
      if (varName === "INGEST_OWNER_USER_ID") {
        console.error(
          "  Add INGEST_OWNER_USER_ID=<uuid> to your .env file.\n" +
            "  Find your UUID in the Supabase dashboard under Authentication > Users.",
        );
      }
      process.exit(1);
    }
  }

  const apiKey = process.env.YOUTUBE_API_KEY!;
  const ownerId = process.env.INGEST_OWNER_USER_ID!;
  const supabase = createSupabaseAdminClient();

  let channelId: string;
  try {
    channelId = await getChannelIdFromHandle(handle, apiKey);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`\nTidal channel ingest starting — ${handle} (${channelId})`);
  console.log(
    "Polling for live broadcasts every 10 minutes (press Ctrl+C to stop)...\n",
  );

  let shuttingDown = false;
  process.on("SIGINT", () => {
    console.log("\nShutting down — waiting for current operation to finish...");
    shuttingDown = true;
  });

  let grandTotal = 0;

  while (!shuttingDown) {
    console.log(`[${timestamp()}] Checking for live broadcast...`);

    try {
      const videoId = await getActiveBroadcastVideoId(channelId, apiKey);

      if (!videoId) {
        console.log(
          `[${timestamp()}] No live broadcast found. Checking again in 10 minutes.`,
        );
        await interruptibleSleep(CHANNEL_POLL_INTERVAL_MS, () => shuttingDown);
        continue;
      }

      console.log(`[${timestamp()}] Found live broadcast: ${videoId}`);

      let liveChatId: string;
      try {
        liveChatId = await getActiveLiveChatId(videoId, apiKey);
      } catch {
        // Broadcast appeared in search but live chat is not yet available —
        // treat it as not ready and retry on the next check.
        console.log(
          `[${timestamp()}] Live chat not available yet. Checking again in 10 minutes.`,
        );
        await interruptibleSleep(CHANNEL_POLL_INTERVAL_MS, () => shuttingDown);
        continue;
      }

      console.log(`Live chat ID: ${liveChatId}`);

      const messagesThisBroadcast = await pollBroadcastUntilEnd({
        liveChatId,
        videoId,
        apiKey,
        supabase,
        ownerId,
        isShuttingDown: () => shuttingDown,
      });

      grandTotal += messagesThisBroadcast;
      console.log(
        `[${timestamp()}] Broadcast complete — ${messagesThisBroadcast.toLocaleString()} messages this broadcast, ${grandTotal.toLocaleString()} total.`,
      );

      if (!shuttingDown) {
        console.log(
          `[${timestamp()}] Waiting 10 minutes before next check...\n`,
        );
        await interruptibleSleep(CHANNEL_POLL_INTERVAL_MS, () => shuttingDown);
      }
    } catch (err) {
      console.error(
        `[${timestamp()}] Error: ${(err as Error).message} — retrying in 10 minutes`,
      );
      await interruptibleSleep(CHANNEL_POLL_INTERVAL_MS, () => shuttingDown);
    }
  }

  console.log(
    `\nDone. ${grandTotal.toLocaleString()} messages written to DB across all broadcasts.`,
  );
  process.exit(0);
}

void main();
