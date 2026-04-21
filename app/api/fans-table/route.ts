import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePageNumber } from "@/lib/utils";

export type FanSummary = {
  id: string;
  ytId: string;
  name: string | null;
  videosCount: number;
  messagesCount: number;
  latestMessageTime: string | null;
  spendProb: number | null;
};

export type SortCol =
  | "name"
  | "yt_id"
  | "videos_count"
  | "messages_count"
  | "latest_message_time"
  | "spend_prob";

export type SortDir = "asc" | "desc";

const VALID_SORT_COLS = new Set<string>([
  "name",
  "yt_id",
  "videos_count",
  "messages_count",
  "latest_message_time",
  "spend_prob",
]);

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
  const rawCol = req.nextUrl.searchParams.get("sortCol") ?? "name";
  const rawDir = req.nextUrl.searchParams.get("sortDir") ?? "asc";

  const sortCol: SortCol = VALID_SORT_COLS.has(rawCol)
    ? (rawCol as SortCol)
    : "name";
  const ascending = rawDir !== "desc";

  const pageStart = (page - 1) * FANS_PER_PAGE;
  const pageEnd = pageStart + FANS_PER_PAGE - 1;

  const { data, count, error } = await supabase
    .from("fan_stats")
    .select(
      "id, yt_id, name, videos_count, messages_count, latest_message_time, spend_prob",
      { count: "exact" },
    )
    .order(sortCol, { ascending, nullsFirst: false })
    .range(pageStart, pageEnd);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fans: FanSummary[] = (data ?? []).map((row) => ({
    id: row.id,
    ytId: row.yt_id,
    name: row.name,
    videosCount: row.videos_count,
    messagesCount: row.messages_count,
    latestMessageTime: row.latest_message_time,
    spendProb: row.spend_prob ?? null,
  }));

  return NextResponse.json({ fans, totalCount: count ?? 0 });
}
