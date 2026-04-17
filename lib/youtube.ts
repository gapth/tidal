const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export type YouTubeVideoResponse = {
  items?: Array<{
    liveStreamingDetails?: {
      activeLiveChatId?: string;
    };
  }>;
};

export type YouTubeChatResponse = {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    snippet?: {
      displayMessage?: string;
      publishedAt?: string;
    };
    authorDetails?: {
      channelId?: string;
      displayName?: string;
    };
  }>;
};

export type NormalizedMessage = {
  ytId: string;
  fanId: string;
  name: string | null;
  text: string | null;
  time: string;
};

export async function getActiveLiveChatId(
  videoId: string,
  apiKey: string,
): Promise<string> {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "liveStreamingDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to fetch video metadata from YouTube.");
  }

  const data = (await response.json()) as YouTubeVideoResponse;
  const liveChatId = data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;

  if (!liveChatId) {
    throw new Error("No active live chat found for this video.");
  }

  return liveChatId;
}

export async function getLiveChatMessages(
  liveChatId: string,
  apiKey: string,
  nextPageToken?: string,
): Promise<YouTubeChatResponse> {
  const url = new URL(`${YOUTUBE_API_BASE}/liveChat/messages`);
  url.searchParams.set("part", "id,snippet,authorDetails");
  url.searchParams.set("liveChatId", liveChatId);
  url.searchParams.set("maxResults", "200");
  url.searchParams.set("key", apiKey);

  if (nextPageToken) {
    url.searchParams.set("pageToken", nextPageToken);
  }

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to fetch live chat messages from YouTube.");
  }

  return (await response.json()) as YouTubeChatResponse;
}

// Converts raw YouTube chat items into a flat, typed list, dropping items with missing IDs.
export function normalizeRawMessages(
  items: YouTubeChatResponse["items"],
): NormalizedMessage[] {
  return (items ?? [])
    .map((item) => ({
      ytId: item.id,
      fanId: item.authorDetails?.channelId ?? "",
      name: item.authorDetails?.displayName ?? null,
      text: item.snippet?.displayMessage ?? null,
      time: item.snippet?.publishedAt ?? new Date().toISOString(),
    }))
    .filter((m) => m.fanId && m.ytId);
}
