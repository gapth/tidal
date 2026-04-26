import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
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
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              Start a new session
            </Link>
            <LogoutButton />
          </div>
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
                  className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-gray-100 px-5 py-4 text-sm text-gray-900 transition-colors hover:bg-gray-50 last:border-b-0"
                >
                  <Link
                    href={`/sessions/${session.id}`}
                    className="absolute inset-0"
                    aria-label={`Open session ${session.id}`}
                  />
                  <div className="pointer-events-none flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-gray-600">
                      {session.video_id}
                    </span>
                    <a
                      href={`https://www.youtube.com/watch?v=${session.video_id}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Watch on YouTube"
                      className="pointer-events-auto relative z-10 shrink-0 text-red-500 hover:text-red-600"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                    </a>
                  </div>
                  <span className="pointer-events-none capitalize text-gray-700">
                    {session.status}
                  </span>
                  <span className="pointer-events-none text-right text-gray-700">
                    {session.promptCount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
