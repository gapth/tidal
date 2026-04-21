import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePageNumber } from "@/lib/utils";
import type { ScoreBreakdown, SignalBreakdown } from "@/lib/scoring";

type FanScoreRow = {
  fan_id: string;
  score: number;
  breakdown: ScoreBreakdown;
  computed_at: string;
};

export type TopFansEntry = {
  fanId: string;
  name: string | null;
  score: number;
  signals: SignalBreakdown[];
  computedAt: string;
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
  const pageEnd = pageStart + TOP_FANS_PER_PAGE - 1;

  const { data: fanScores, count } = await supabase
    .from("fan_scores")
    .select("fan_id, score, breakdown, computed_at", { count: "exact" })
    .eq("score_type", type)
    .order("score", { ascending: false })
    .range(pageStart, pageEnd);

  const scoredRows = (fanScores ?? []) as FanScoreRow[];
  const nameMap = new Map<string, string | null>();
  const spendProbMap = new Map<string, number>();

  if (scoredRows.length > 0) {
    const fanIds = scoredRows.map((r) => r.fan_id);
    const [{ data: nameRows }, { data: predRows }] = await Promise.all([
      supabase.from("fans").select("id, name").in("id", fanIds),
      supabase
        .from("fan_predictions")
        .select("fan_id, spend_prob")
        .in("fan_id", fanIds),
    ]);
    for (const f of nameRows ?? []) nameMap.set(f.id, f.name);
    for (const p of predRows ?? []) spendProbMap.set(p.fan_id, p.spend_prob);
  }

  const entries: TopFansEntry[] = scoredRows.map((row) => ({
    fanId: row.fan_id,
    name: nameMap.get(row.fan_id) ?? null,
    score: row.score,
    signals: row.breakdown.signals ?? [],
    computedAt: row.computed_at,
    spendProb: spendProbMap.get(row.fan_id) ?? null,
  }));

  return NextResponse.json({ entries, totalCount: count ?? 0 });
}
