import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLink } from "@/components/brand-link";
import { SignOutButton } from "@/components/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatTimestamp, parsePageNumber } from "@/lib/utils";
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

type FanSummary = {
  id: string;
  ytId: string;
  name: string | null;
  videosCount: number;
  messagesCount: number;
  latestMessageTime: string | null;
};

type FansPageProps = {
  searchParams: Promise<{
    page?: string;
  }>;
};

export const dynamic = "force-dynamic";
const FANS_PER_PAGE = 20;

function buildPageHref(page: number) {
  return page === 1 ? "/fans" : `/fans?page=${page}`;
}

export default async function FansPage({ searchParams }: FansPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const currentPage = parsePageNumber(resolvedSearchParams.page);
  const pageStart = (currentPage - 1) * FANS_PER_PAGE;
  const pageEnd = pageStart + FANS_PER_PAGE - 1;

  const [
    { count: totalFansCount, error: countError },
    { data: fans, error: fansError },
  ] = await Promise.all([
    supabase.from("fans").select("id", { count: "exact", head: true }),
    supabase
      .from("fans")
      .select("id, yt_id, name")
      .order("name", { ascending: true })
      .order("yt_id", { ascending: true })
      .range(pageStart, pageEnd),
  ]);

  if (countError) {
    throw new Error(countError.message);
  }

  if (fansError) {
    throw new Error(fansError.message);
  }

  const pagedFans = (fans ?? []) as FanRow[];
  const totalTrackedFans = totalFansCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalTrackedFans / FANS_PER_PAGE));

  if (totalTrackedFans > 0 && currentPage > totalPages) {
    redirect(buildPageHref(totalPages));
  }

  const fanIds = pagedFans.map((fan) => fan.id);
  const { data: messages, error: messagesError } = fanIds.length
    ? await supabase
        .from("messages")
        .select("fan_id, yt_video_id, time")
        .in("fan_id", fanIds)
    : { data: [], error: null };

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  const statsByFanId = aggregateMessageStatsByFanId(
    (messages ?? []) as MessageRow[],
  );

  const fanSummaries = pagedFans.map((fan) => {
    const stats = statsByFanId.get(fan.id);
    return {
      id: fan.id,
      ytId: fan.yt_id,
      name: fan.name,
      videosCount: stats?.videos.size ?? 0,
      messagesCount: stats?.messagesCount ?? 0,
      latestMessageTime: stats?.latestMessageTime ?? null,
    } satisfies FanSummary;
  });

  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  // Show "0" when empty, otherwise 1-indexed for human readability.
  const pageLabelStart = totalTrackedFans === 0 ? 0 : pageStart + 1;
  const pageLabelEnd = Math.min(pageStart + fanSummaries.length, totalTrackedFans);

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

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Insights</h2>
              <p className="mt-1 text-sm text-slate-400">
                Placeholder for fan engagement summaries and trends.
              </p>
            </div>
          </div>

          <div className="mt-4 flex min-h-36 items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/40 text-sm text-slate-500">
            Insights coming soon.
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Fan Table</h2>
              <p className="mt-1 text-sm text-slate-400">
                Fan identity and chat activity across tracked videos.
              </p>
            </div>
            <div className="text-right text-sm text-slate-400">
              <p>
                Showing {pageLabelStart}-{pageLabelEnd} of {totalTrackedFans}
              </p>
              <p>
                Page {totalTrackedFans === 0 ? 0 : currentPage} of{" "}
                {totalTrackedFans === 0 ? 0 : totalPages}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="border-b border-slate-800 px-4 py-3 font-medium">
                    YouTube Fan ID
                  </th>
                  <th className="border-b border-slate-800 px-4 py-3 font-medium">
                    Name
                  </th>
                  <th className="border-b border-slate-800 px-4 py-3 font-medium">
                    Videos with Messages
                  </th>
                  <th className="border-b border-slate-800 px-4 py-3 font-medium">
                    Chat Messages
                  </th>
                  <th className="border-b border-slate-800 px-4 py-3 font-medium">
                    Latest Message
                  </th>
                </tr>
              </thead>
              <tbody>
                {fanSummaries.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-slate-500"
                      colSpan={5}
                    >
                      No tracked fans yet.
                    </td>
                  </tr>
                ) : (
                  fanSummaries.map((fan) => (
                    <tr key={fan.id} className="text-slate-200">
                      <td className="border-b border-slate-900 px-4 py-4 font-mono text-xs text-cyan-300">
                        {fan.ytId}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4">
                        {fan.name?.trim() || "Anonymous Fan"}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4">
                        {fan.videosCount}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4">
                        {fan.messagesCount}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4 text-slate-400">
                        {formatTimestamp(fan.latestMessageTime)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-800 pt-4">
            <div className="text-sm text-slate-500">
              {FANS_PER_PAGE} fans per page
            </div>
            <div className="flex items-center gap-3">
              {hasPreviousPage ? (
                <Link
                  className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                  href={buildPageHref(currentPage - 1)}
                >
                  Previous
                </Link>
              ) : (
                <span className="inline-flex rounded-full border border-slate-800 px-4 py-2 text-sm font-medium text-slate-600">
                  Previous
                </span>
              )}
              {hasNextPage ? (
                <Link
                  className="inline-flex rounded-full border border-cyan-400/30 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-300 hover:text-white"
                  href={buildPageHref(currentPage + 1)}
                >
                  Next
                </Link>
              ) : (
                <span className="inline-flex rounded-full border border-slate-800 px-4 py-2 text-sm font-medium text-slate-600">
                  Next
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
