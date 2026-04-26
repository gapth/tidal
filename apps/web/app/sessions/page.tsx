import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type SessionRow = {
  id: string;
  status: string;
  video_id: string;
  created_at: string;
};

type SessionWithPromptCount = SessionRow & {
  promptCount: number;
};

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/sessions");
  }

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, status, video_id, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load sessions: ${error.message}`);
  }

  const sessionsWithPromptCounts = await Promise.all(
    ((sessions ?? []) as SessionRow[]).map(async (session) => {
      const { count, error: countError } = await supabase
        .from("prompts")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("session_id", session.id);

      if (countError) {
        throw new Error(
          `Failed to load prompt count for session ${session.id}: ${countError.message}`,
        );
      }

      return {
        ...session,
        promptCount: count ?? 0,
      };
    }),
  );

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sessions</h1>
            <p className="mt-2 text-sm text-gray-500">
              Review past and active collection runs.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-500 underline hover:text-gray-700"
          >
            Start a new session
          </Link>
        </div>

        {sessionsWithPromptCounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
            No sessions yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              <span>Video ID</span>
              <span>Status</span>
              <span>Prompts</span>
            </div>
            <div>
              {sessionsWithPromptCounts.map((session) => (
                <div
                  key={session.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-gray-100 px-5 py-4 text-sm text-gray-900 transition-colors hover:bg-gray-50 last:border-b-0"
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${session.video_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-gray-600 underline hover:text-gray-900"
                  >
                    {session.video_id}
                  </a>
                  <Link
                    href={`/sessions/${session.id}`}
                    className="capitalize text-gray-700 underline hover:text-gray-900"
                  >
                    {session.status}
                  </Link>
                  <Link
                    href={`/sessions/${session.id}`}
                    className="text-right text-gray-700 underline hover:text-gray-900"
                  >
                    {session.promptCount}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
