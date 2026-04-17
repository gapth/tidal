/**
 * Usage: npm run ingest -- <youtube_url_or_video_id>
 *
 * Required env vars (loaded from .env by the npm script):
 *   YOUTUBE_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INGEST_OWNER_USER_ID  — a UUID from Supabase Auth > Users
 */

import {
  getActiveLiveChatId,
  getLiveChatMessages,
  normalizeRawMessages,
  type YouTubeChatResponse,
} from "@/lib/youtube";
import { upsertFansAndMessages } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// YouTube returns pollingIntervalMillis but it's not in our shared type.
type ChatResponseWithPolling = YouTubeChatResponse & {
  pollingIntervalMillis?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const ERROR_BACKOFF_MS = 15_000;

function extractVideoId(input: string): string {
  // Raw 11-character video ID (YouTube IDs are always 11 chars of [A-Za-z0-9_-])
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) {
    return input;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Cannot parse "${input}" as a URL or video ID.`);
  }

  const { hostname, pathname, searchParams } = url;

  if (hostname.includes("youtu.be")) {
    return pathname.slice(1);
  }

  if (hostname.includes("youtube.com")) {
    const fromQuery = searchParams.get("v");
    if (fromQuery) return fromQuery;

    // youtube.com/live/<ID>
    const liveMatch = pathname.match(/^\/live\/([A-Za-z0-9_-]+)/);
    if (liveMatch) return liveMatch[1];
  }

  throw new Error(
    `Could not extract a video ID from "${input}".\n` +
      `  Supported formats:\n` +
      `    https://www.youtube.com/watch?v=<ID>\n` +
      `    https://www.youtube.com/live/<ID>\n` +
      `    https://youtu.be/<ID>\n` +
      `    <raw 11-char ID>`,
  );
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const rawInput = process.argv[2];

  if (!rawInput) {
    console.error("Usage: npm run ingest -- <youtube_url_or_video_id>");
    process.exit(1);
  }

  // Validate required env vars before doing anything else.
  const requiredVars = [
    "YOUTUBE_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "INGEST_OWNER_USER_ID",
  ];
  for (const varName of requiredVars) {
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

  let videoId: string;
  try {
    videoId = extractVideoId(rawInput);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  console.log(`\nTidal ingest starting — video: ${videoId}`);

  const supabase = createSupabaseAdminClient();

  let liveChatId: string;
  try {
    liveChatId = await getActiveLiveChatId(videoId, apiKey);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.error(
      "  The stream may not be live yet, or the video ID is incorrect.",
    );
    process.exit(1);
  }

  console.log(`Live chat ID: ${liveChatId}`);
  console.log("Polling live chat (press Ctrl+C to stop)...\n");

  let shuttingDown = false;
  process.on("SIGINT", () => {
    console.log("\nShutting down — waiting for current poll to finish...");
    shuttingDown = true;
  });

  let nextPageToken: string | undefined;
  let totalMessages = 0;

  while (!shuttingDown) {
    try {
      const raw = (await getLiveChatMessages(
        liveChatId,
        apiKey,
        nextPageToken,
      )) as ChatResponseWithPolling;

      const pollIntervalMs = raw.pollingIntervalMillis ??
        DEFAULT_POLL_INTERVAL_MS;
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

      await sleep(pollIntervalMs);
    } catch (err) {
      console.error(
        `[${timestamp()}] Poll error: ${
          (err as Error).message
        } — retrying after ${ERROR_BACKOFF_MS / 1000}s`,
      );
      await sleep(ERROR_BACKOFF_MS);
    }
  }

  console.log(
    `\nDone. ${totalMessages.toLocaleString()} messages written to DB.`,
  );
  process.exit(0);
}

void main();
