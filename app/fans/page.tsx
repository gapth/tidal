import Link from "next/link";
import { BrandLink } from "@/components/brand-link";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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

export const dynamic = "force-dynamic";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No messages yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function FansPage() {
  const supabase = getSupabaseServerClient();

  const [{ data: fans, error: fansError }, { data: messages, error: messagesError }] =
    await Promise.all([
      supabase.from("fans").select("id, yt_id, name").order("name", { ascending: true }),
      supabase.from("messages").select("fan_id, yt_video_id, time"),
    ]);

  if (fansError) {
    throw new Error(fansError.message);
  }

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  const messageStatsByFanId = new Map<
    string,
    {
      videos: Set<string>;
      messagesCount: number;
      latestMessageTime: string | null;
    }
  >();

  for (const message of (messages ?? []) as MessageRow[]) {
    const current = messageStatsByFanId.get(message.fan_id) ?? {
      videos: new Set<string>(),
      messagesCount: 0,
      latestMessageTime: null,
    };

    current.videos.add(message.yt_video_id);
    current.messagesCount += 1;

    if (!current.latestMessageTime || message.time > current.latestMessageTime) {
      current.latestMessageTime = message.time;
    }

    messageStatsByFanId.set(message.fan_id, current);
  }

  const fanSummaries = ((fans ?? []) as FanRow[]).map((fan) => {
    const stats = messageStatsByFanId.get(fan.id);

    return {
      id: fan.id,
      ytId: fan.yt_id,
      name: fan.name,
      videosCount: stats?.videos.size ?? 0,
      messagesCount: stats?.messagesCount ?? 0,
      latestMessageTime: stats?.latestMessageTime ?? null,
    } satisfies FanSummary;
  });

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
              <Link
                className="inline-flex rounded-full border border-cyan-400/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-cyan-200 transition hover:border-cyan-300 hover:text-white"
                href="/"
              >
                Back To Tracker
              </Link>
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                Total Tracked Fans
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {fanSummaries.length}
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
        </section>
      </div>
    </main>
  );
}
