import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLink } from "@/components/brand-link";
import { SignOutButton } from "@/components/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ScoreBreakdown, SignalBreakdown } from "@/lib/scoring";
import { TopFansSection } from "./top-fans-section";
import { FanTableSection } from "./fan-table-section";

export const dynamic = "force-dynamic";

const TOP_FANS_PER_PAGE = 10;
const FANS_PER_PAGE = 20;

type FanScoreRow = {
  fan_id: string;
  score: number;
  breakdown: ScoreBreakdown;
  computed_at: string;
};

export default async function FansPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { count: totalFansCount },
    { data: nudgeScores, count: totalNudgeCount },
    { data: supporterScores, count: totalSupporterCount },
    { data: fans },
  ] = await Promise.all([
    supabase.from("fans").select("id", { count: "exact", head: true }),
    supabase
      .from("fan_scores")
      .select("fan_id, score, breakdown, computed_at", { count: "exact" })
      .eq("score_type", "nudge")
      .order("score", { ascending: false })
      .range(0, TOP_FANS_PER_PAGE - 1),
    supabase
      .from("fan_scores")
      .select("fan_id, score, breakdown, computed_at", { count: "exact" })
      .eq("score_type", "supporter")
      .order("score", { ascending: false })
      .range(0, TOP_FANS_PER_PAGE - 1),
    supabase
      .from("fan_stats")
      .select(
        "id, yt_id, name, videos_count, messages_count, latest_message_time, spend_prob",
      )
      .order("name", { ascending: true, nullsFirst: false })
      .range(0, FANS_PER_PAGE - 1),
  ]);

  const totalTrackedFans = totalFansCount ?? 0;

  async function resolveTopFans(rows: FanScoreRow[] | null) {
    const scoredRows = (rows ?? []) as FanScoreRow[];
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
    return scoredRows.map((row) => ({
      fanId: row.fan_id,
      name: nameMap.get(row.fan_id) ?? null,
      score: row.score,
      signals: (row.breakdown.signals ?? []) as SignalBreakdown[],
      computedAt: row.computed_at,
      spendProb: spendProbMap.get(row.fan_id) ?? null,
    }));
  }

  const [initialNudgeFans, initialSupporterFans] = await Promise.all([
    resolveTopFans(nudgeScores as FanScoreRow[] | null),
    resolveTopFans(supporterScores as FanScoreRow[] | null),
  ]);

  const initialFans = (fans ?? []).map((row) => ({
    id: row.id,
    ytId: row.yt_id,
    name: row.name,
    videosCount: row.videos_count ?? 0,
    messagesCount: row.messages_count ?? 0,
    latestMessageTime: row.latest_message_time ?? null,
    spendProb: row.spend_prob ?? null,
  }));

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <BrandLink />
              <h1 className="text-3xl font-semibold text-white">
                Tracked Fans
              </h1>
              <p className="max-w-2xl text-sm text-slate-400">
                Overview of fan activity across tracked YouTube live chats.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  className="inline-flex rounded-full border border-cyan-400/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-cyan-200 transition hover:border-cyan-300 hover:text-white"
                  href="/"
                >
                  Back To Tracker
                </Link>
                <SignOutButton />
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                Total Tracked Fans
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {totalTrackedFans}
              </p>
            </div>
          </div>
        </section>

        <TopFansSection
          type="nudge"
          initialEntries={initialNudgeFans}
          initialTotal={totalNudgeCount ?? 0}
        />

        <TopFansSection
          type="supporter"
          initialEntries={initialSupporterFans}
          initialTotal={totalSupporterCount ?? 0}
        />

        <FanTableSection
          initialFans={initialFans}
          initialTotal={totalTrackedFans}
        />
      </div>
    </main>
  );
}
