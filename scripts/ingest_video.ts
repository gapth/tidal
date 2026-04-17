/**
 * Ingests live chat for a specific YouTube video/broadcast.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ingest_video.ts <youtube_url_or_video_id>
 *
 * Required env vars:
 *   YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INGEST_OWNER_USER_ID
 */

import { getActiveLiveChatId } from "@/lib/youtube";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { pollBroadcastUntilEnd, timestamp } from "./_poll";

const REQUIRED_VARS = [
  "YOUTUBE_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INGEST_OWNER_USER_ID",
];

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

async function main() {
  const rawInput = process.argv[2];

  if (!rawInput) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/ingest_video.ts <youtube_url_or_video_id>",
    );
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

  const totalMessages = await pollBroadcastUntilEnd({
    liveChatId,
    videoId,
    apiKey,
    supabase,
    ownerId,
    isShuttingDown: () => shuttingDown,
  });

  console.log(
    `\nDone. ${totalMessages.toLocaleString()} messages written to DB.`,
  );
  process.exit(0);
}

void main();
