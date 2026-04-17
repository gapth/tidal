import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActiveLiveChatId,
  getLiveChatMessages,
  normalizeRawMessages,
} from "@/lib/youtube";
import { upsertFansAndMessages } from "@/lib/db";

const youtubeApiKey = process.env.YOUTUBE_API_KEY;

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

    const liveChatId = await getActiveLiveChatId(videoId, youtubeApiKey);
    const chatResponse = await getLiveChatMessages(
      liveChatId,
      youtubeApiKey,
      nextPageToken,
    );
    const messages = normalizeRawMessages(chatResponse.items);

    if (messages.length > 0) {
      await upsertFansAndMessages(supabase, messages, videoId, user.id);
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
