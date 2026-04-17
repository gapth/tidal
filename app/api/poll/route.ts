import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

type YouTubeVideoResponse = {
  items?: Array<{
    liveStreamingDetails?: {
      activeLiveChatId?: string;
    };
  }>;
};

type YouTubeChatResponse = {
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

const youtubeApiKey = process.env.YOUTUBE_API_KEY;

async function getActiveLiveChatId(videoId: string) {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "liveStreamingDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", youtubeApiKey ?? "");

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

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

async function getLiveChatMessages(liveChatId: string, nextPageToken?: string) {
  const url = new URL(`${YOUTUBE_API_BASE}/liveChat/messages`);
  url.searchParams.set("part", "id,snippet,authorDetails");
  url.searchParams.set("liveChatId", liveChatId);
  url.searchParams.set("maxResults", "200");
  url.searchParams.set("key", youtubeApiKey ?? "");

  if (nextPageToken) {
    url.searchParams.set("pageToken", nextPageToken);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch live chat messages from YouTube.");
  }

  return (await response.json()) as YouTubeChatResponse;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!youtubeApiKey) {
      return NextResponse.json(
        { error: "Missing YOUTUBE_API_KEY." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      videoId?: string;
      nextPageToken?: string;
    };

    const videoId = body.videoId?.trim();
    const nextPageToken = body.nextPageToken?.trim();

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId is required." },
        { status: 400 },
      );
    }

    const liveChatId = await getActiveLiveChatId(videoId);
    const chatResponse = await getLiveChatMessages(liveChatId, nextPageToken);
    const rawMessages = chatResponse.items ?? [];

    const messages = rawMessages
      .map((item) => ({
        ytId: item.id,
        fanId: item.authorDetails?.channelId ?? "",
        name: item.authorDetails?.displayName ?? null,
        text: item.snippet?.displayMessage ?? null,
        time: item.snippet?.publishedAt ?? new Date().toISOString(),
      }))
      .filter((message) => message.fanId && message.ytId);

    if (messages.length > 0) {
      const fansByYtId = new Map<
        string,
        {
          owner_user_id: string;
          yt_id: string;
          name: string | null;
        }
      >();

      for (const message of messages) {
        fansByYtId.set(message.fanId, {
          owner_user_id: user.id,
          yt_id: message.fanId,
          name: message.name,
        });
      }

      const fans = Array.from(fansByYtId.values());

      const { data: upsertedFans, error: fansError } = await supabase
        .from("fans")
        .upsert(fans, { onConflict: "owner_user_id,yt_id" })
        .select("id, yt_id");

      if (fansError) {
        throw fansError;
      }

      const fanIdsByYtId = new Map(
        (upsertedFans ?? []).map((fan) => [fan.yt_id as string, fan.id as string]),
      );

      const dbMessages = messages.map((message) => ({
        owner_user_id: user.id,
        yt_id: message.ytId,
        yt_video_id: videoId,
        fan_id: fanIdsByYtId.get(message.fanId),
        text: message.text,
        time: message.time,
      }))
      .filter((message) => message.fan_id);

      const { error: messagesError } = await supabase
        .from("messages")
        .upsert(dbMessages, { onConflict: "owner_user_id,yt_id" });

      if (messagesError) {
        throw messagesError;
      }
    }

    return NextResponse.json({
      nextPageToken: chatResponse.nextPageToken ?? null,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected polling error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
