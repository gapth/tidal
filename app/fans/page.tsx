import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLink } from "@/components/brand-link";
import { SignOutButton } from "@/components/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TopFansEntry } from "@/app/api/top-fans/route";
import { TopFansSection } from "./top-fans-section";
import { FanTableSection } from "./fan-table-section";

export const dynamic = "force-dynamic";

const TOP_FANS_PER_PAGE = 10;
const FANS_PER_PAGE = 20;

export default async function FansPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch total fans count, first page of fan table, and top supporters in parallel
  const [
    { count: totalFansCount },
    { data: supporterRows, count: totalSupporterCount },
    { data: fans },
  ] = await Promise.all([
    supabase.from("fans").select("id", { count: "exact", head: true }),
    supabase
      .from("fan_stats")
      .select(
        "id, name, videos_count, messages_count, videos_with_paid_events, paid_event_count, spend_prob",
        { count: "exact" },
      )
      .eq("has_paid_event", true)
      .order("paid_event_count", { ascending: false, nullsFirst: false })
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

  const initialSupporterFans: TopFansEntry[] = (supporterRows ?? []).map(
    (row) => ({
      fanId: row.id,
      name: row.name,
      videosCount: row.videos_count ?? 0,
      messagesCount: row.messages_count ?? 0,
      videosWithPaidEvents: row.videos_with_paid_events ?? null,
      paidEventCount: row.paid_event_count ?? null,
      spendProb: row.spend_prob ?? null,
    }),
  );

  // Nudge fans: chatted in last stream, didn't spend — sequential (stream ID needed first)
  let initialNudgeFans: TopFansEntry[] = [];
  let totalNudgeCount = 0;

  const { data: lastMsg } = await supabase
    .from("messages")
    .select("yt_video_id")
    .order("time", { ascending: false })
    .limit(1)
    .single();

  if (lastMsg?.yt_video_id) {
    const lastStreamId = lastMsg.yt_video_id;

    const [{ data: streamFanRows }, { data: paidFanRows }] = await Promise.all([
      supabase
        .from("messages")
        .select("fan_id")
        .eq("yt_video_id", lastStreamId),
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
    totalNudgeCount = nudgeFanIds.length;

    if (nudgeFanIds.length > 0) {
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

      initialNudgeFans = sorted.slice(0, TOP_FANS_PER_PAGE).map((row) => ({
        fanId: row.id,
        name: row.name,
        videosCount: row.videos_count ?? 0,
        messagesCount: row.messages_count ?? 0,
        videosWithPaidEvents: null,
        paidEventCount: null,
        spendProb: row.spend_prob ?? null,
      }));
    }
  }

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
          initialTotal={totalNudgeCount}
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
