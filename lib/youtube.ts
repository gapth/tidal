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
      type?: string;
      displayMessage?: string;
      publishedAt?: string;
      superChatDetails?: {
        amountMicros?: string; // YouTube returns this as a string
        currency?: string;
        amountDisplayString?: string;
        userComment?: string;
      };
      superStickerDetails?: {
        amountMicros?: string; // YouTube returns this as a string
        currency?: string;
        amountDisplayString?: string;
      };
      membershipGiftingDetails?: {
        giftMembershipsCount?: number;
        giftMembershipsLevelName?: string;
      };
      giftDetails?: {
        jewelsAmount?: number;
      };
      newSponsorDetails?: {
        memberLevelName?: string;
        isUpgrade?: boolean;
      };
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
  paidEventType: string | null;
  paidAmountMicros: number | null;
  paidCurrency: string | null;
};

type ChatItem = NonNullable<YouTubeChatResponse["items"]>[0];

const PAID_EVENT_TYPES = new Set([
  "superChatEvent",
  "superStickerEvent",
  "membershipGiftingEvent",
  "giftEvent",
  "newSponsorEvent",
]);

function extractPaidDetails(item: ChatItem): Pick<
  NormalizedMessage,
  "paidEventType" | "paidAmountMicros" | "paidCurrency"
> {
  const type = item.snippet?.type;

  if (!type || !PAID_EVENT_TYPES.has(type)) {
    return { paidEventType: null, paidAmountMicros: null, paidCurrency: null };
  }

  // superChatEvent and superStickerEvent carry amountMicros + currency directly.
  const monetaryDetails =
    item.snippet?.superChatDetails ?? item.snippet?.superStickerDetails;
  if (monetaryDetails) {
    return {
      paidEventType: type,
      paidAmountMicros: monetaryDetails.amountMicros
        ? Number(monetaryDetails.amountMicros)
        : null,
      paidCurrency: monetaryDetails.currency ?? null,
    };
  }

  // giftEvent uses YouTube Jewels; normalise to micros with a synthetic "JWL" currency.
  if (type === "giftEvent") {
    const jewels = item.snippet?.giftDetails?.jewelsAmount;
    return {
      paidEventType: type,
      paidAmountMicros: jewels != null ? jewels * 1_000_000 : null,
      paidCurrency: "JWL",
    };
  }

  // membershipGiftingEvent, newSponsorEvent — paid but no monetary amount exposed.
  return { paidEventType: type, paidAmountMicros: null, paidCurrency: null };
}

type YouTubeChannelResponse = {
  items?: Array<{ id?: string }>;
};

type YouTubeSearchResponse = {
  items?: Array<{ id?: { videoId?: string } }>;
};

// Resolves a YouTube handle (e.g. "@KirscheVerstahl" or "KirscheVerstahl") to a channel ID.
export async function getChannelIdFromHandle(
  handle: string,
  apiKey: string,
): Promise<string> {
  const normalizedHandle = handle.startsWith("@") ? handle.slice(1) : handle;
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "id");
  url.searchParams.set("forHandle", normalizedHandle);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to look up channel from YouTube.");
  }

  const data = (await response.json()) as YouTubeChannelResponse;
  const channelId = data.items?.[0]?.id;

  if (!channelId) {
    throw new Error(`No channel found for handle "@${normalizedHandle}".`);
  }

  return channelId;
}

// Returns the video ID of the channel's current live broadcast, or null if none is active.
// Uses search.list (100 quota units/call) — call sparingly.
export async function getActiveBroadcastVideoId(
  channelId: string,
  apiKey: string,
): Promise<string | null> {
  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set("part", "id");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("eventType", "live");
  url.searchParams.set("type", "video");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to search for live broadcasts on YouTube.");
  }

  const data = (await response.json()) as YouTubeSearchResponse;
  return data.items?.[0]?.id?.videoId ?? null;
}

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
      ...extractPaidDetails(item),
    }))
    .filter((m) => m.fanId && m.ytId);
}
