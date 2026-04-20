import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePageNumber } from "@/lib/utils";
import { aggregateMessageStatsByFanId } from "@/lib/fan-stats";

type FanRow = {
  id: string;
  yt_id: string;
  name: string | null;
};

type MessageRow = {
  fan_id: string;
  yt_video_id: string;
  time: string;
};

export type FanSummary = {
  id: string;
  ytId: string;
  name: string | null;
  videosCount: number;
  messagesCount: number;
  latestMessageTime: string | null;
};

const FANS_PER_PAGE = 20;

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const page = parsePageNumber(
    req.nextUrl.searchParams.get("page") ?? undefined,
  );
  const pageStart = (page - 1) * FANS_PER_PAGE;
  const pageEnd = pageStart + FANS_PER_PAGE - 1;

  const { data: fans, count, error: fansError } = await supabase
    .from("fans")
    .select("id, yt_id, name", { count: "exact" })
    .order("name", { ascending: true })
    .order("yt_id", { ascending: true })
    .range(pageStart, pageEnd);

  if (fansError) {
    return NextResponse.json({ error: fansError.message }, { status: 500 });
  }

  const pagedFans = (fans ?? []) as FanRow[];
  const fanIds = pagedFans.map((f) => f.id);

  const { data: messages, error: messagesError } = fanIds.length
    ? await supabase
        .from("messages")
        .select("fan_id, yt_video_id, time")
        .in("fan_id", fanIds)
    : { data: [], error: null };

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const statsByFanId = aggregateMessageStatsByFanId(
    (messages ?? []) as MessageRow[],
  );

  const fanSummaries: FanSummary[] = pagedFans.map((fan) => {
    const stats = statsByFanId.get(fan.id);
    return {
      id: fan.id,
      ytId: fan.yt_id,
      name: fan.name,
      videosCount: stats?.videos.size ?? 0,
      messagesCount: stats?.messagesCount ?? 0,
      latestMessageTime: stats?.latestMessageTime ?? null,
    };
  });

  return NextResponse.json({ fans: fanSummaries, totalCount: count ?? 0 });
}
