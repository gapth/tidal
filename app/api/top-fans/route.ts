import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePageNumber } from "@/lib/utils";

export type TopFansEntry = {
  fanId: string;
  name: string | null;
  videosCount: number;
  messagesCount: number;
  videosWithPaidEvents: number | null;
  paidEventCount: number | null;
  spendProb: number | null;
};

const TOP_FANS_PER_PAGE = 10;

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
  const type =
    req.nextUrl.searchParams.get("type") === "supporter"
      ? "supporter"
      : "nudge";
  const pageStart = (page - 1) * TOP_FANS_PER_PAGE;

  if (type === "supporter") {
    const { data, count, error } = await supabase
      .from("fan_stats")
      .select(
        "id, name, videos_count, messages_count, videos_with_paid_events, paid_event_count, spend_prob",
        { count: "exact" },
      )
      .eq("has_paid_event", true)
      .order("paid_event_count", { ascending: false, nullsFirst: false })
      .range(pageStart, pageStart + TOP_FANS_PER_PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries: TopFansEntry[] = (data ?? []).map((row) => ({
      fanId: row.id,
      name: row.name,
      videosCount: row.videos_count ?? 0,
      messagesCount: row.messages_count ?? 0,
      videosWithPaidEvents: row.videos_with_paid_events ?? null,
      paidEventCount: row.paid_event_count ?? null,
      spendProb: row.spend_prob ?? null,
    }));

    return NextResponse.json({ entries, totalCount: count ?? 0 });
  }

  // Nudge: fans who chatted in the last stream but didn't spend, sorted by spend_prob DESC
  const { data: lastMsg } = await supabase
    .from("messages")
    .select("yt_video_id")
    .order("time", { ascending: false })
    .limit(1)
    .single();

  if (!lastMsg?.yt_video_id) {
    return NextResponse.json({ entries: [], totalCount: 0 });
  }

  const lastStreamId = lastMsg.yt_video_id;

  const [{ data: streamFanRows }, { data: paidFanRows }] = await Promise.all([
    supabase.from("messages").select("fan_id").eq("yt_video_id", lastStreamId),
    supabase
      .from("messages")
      .select("fan_id")
      .eq("yt_video_id", lastStreamId)
      .not("paid_event_type", "is", null),
  ]);

  const allFanIds = [
    ...new Set((streamFanRows ?? []).map((r) => r.fan_id as string)),
  ];
  const paidFanIds = new Set(
    (paidFanRows ?? []).map((r) => r.fan_id as string),
  );
  const nudgeFanIds = allFanIds.filter((id) => !paidFanIds.has(id));

  if (nudgeFanIds.length === 0) {
    return NextResponse.json({ entries: [], totalCount: 0 });
  }

  // fan_stats includes spend_prob, videos_count, messages_count, and name in one query.
  // Chunk to avoid URI too long errors with large fan lists.
  const CHUNK = 100;
  const chunks = Array.from(
    { length: Math.ceil(nudgeFanIds.length / CHUNK) },
    (_, i) => nudgeFanIds.slice(i * CHUNK, (i + 1) * CHUNK),
  );
  const chunkResults = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("fan_stats")
        .select("id, name, videos_count, messages_count, spend_prob")
        .in("id", ids),
    ),
  );
  const statsRows = chunkResults.flatMap((r) => r.data ?? []);

  const sorted = (statsRows ?? []).slice().sort((a, b) => {
    if (a.spend_prob === null && b.spend_prob === null) return 0;
    if (a.spend_prob === null) return 1;
    if (b.spend_prob === null) return -1;
    return b.spend_prob - a.spend_prob;
  });

  const pageSlice = sorted.slice(pageStart, pageStart + TOP_FANS_PER_PAGE);

  const entries: TopFansEntry[] = pageSlice.map((row) => ({
    fanId: row.id,
    name: row.name,
    videosCount: row.videos_count ?? 0,
    messagesCount: row.messages_count ?? 0,
    videosWithPaidEvents: null,
    paidEventCount: null,
    spendProb: row.spend_prob ?? null,
  }));

  return NextResponse.json({ entries, totalCount: sorted.length });
}
