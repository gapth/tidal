"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogoutButton } from "@/components/logout-button";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type PromptRow = {
  id: string;
  session_id: string;
  source: string;
  category: string;
  content: string;
  dismissed: boolean;
  created_at: string;
};

type SessionStatus = "active" | "stopped" | "ended";

const CATEGORY_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  monetization_event: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    label: "Monetization",
  },
  repeated_question: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    label: "Repeated question",
  },
  energy_spike: {
    bg: "bg-red-100",
    text: "text-red-800",
    label: "Energy spike",
  },
  message_acknowledgment: {
    bg: "bg-green-100",
    text: "text-green-800",
    label: "Acknowledge",
  },
  novel_question: {
    bg: "bg-indigo-100",
    text: "text-indigo-800",
    label: "Novel question",
  },
  confusion_cluster: {
    bg: "bg-purple-100",
    text: "text-purple-800",
    label: "Confusion",
  },
  sentiment_shift: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    label: "Sentiment shift",
  },
  factual_correction: {
    bg: "bg-teal-100",
    text: "text-teal-800",
    label: "Correction",
  },
  stream_quality_issue: {
    bg: "bg-gray-100",
    text: "text-gray-700",
    label: "Stream quality",
  },
};

const CATEGORY_ORDER = [
  "monetization_event",
  "energy_spike",
  "repeated_question",
  "novel_question",
  "confusion_cluster",
  "factual_correction",
  "sentiment_shift",
  "message_acknowledgment",
  "stream_quality_issue",
];

function categoryStyle(cat: string) {
  return (
    CATEGORY_STYLES[cat] ?? {
      bg: "bg-gray-100",
      text: "text-gray-700",
      label: cat,
    }
  );
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

async function stopSession(sessionId: string) {
  await fetch("/api/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  }).catch(() => {});
}

async function resumeSession(sessionId: string) {
  const res = await fetch("/api/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Server error ${res.status}`,
    );
  }
}

function CategoryColumn({
  category,
  prompts,
  dismissed,
  limit,
  showDismissed,
  onDismiss,
  onLoadMore,
}: {
  category: string;
  prompts: PromptRow[];
  dismissed: Set<string>;
  limit: number;
  showDismissed: boolean;
  onDismiss: (id: string) => void;
  onLoadMore: () => void;
}) {
  const style = categoryStyle(category);
  const visible = showDismissed
    ? prompts
    : prompts.filter((p) => !dismissed.has(p.id));

  if (visible.length === 0) return null;

  const shown = visible.slice(0, limit);
  const remaining = visible.length - limit;
  const hasMore = remaining > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
        >
          {style.label}
        </span>
        <span className="text-xs text-gray-400">{visible.length}</span>
      </div>

      {shown.map((p) => {
        const isDismissed = dismissed.has(p.id);
        return (
          <div
            key={p.id}
            className={`bg-white rounded-lg border border-gray-200 px-3 py-2.5 ${isDismissed ? "opacity-50" : ""}`}
          >
            <p className="text-sm text-gray-900 leading-snug mb-1.5">
              {p.content}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400 font-mono truncate">
                {p.source}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">
                  {relativeTime(p.created_at)}
                </span>
                {isDismissed ? (
                  <span className="text-xs text-gray-400 italic">
                    Dismissed
                  </span>
                ) : (
                  <button
                    onClick={() => onDismiss(p.id)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <button
          onClick={onLoadMore}
          className="text-xs text-gray-500 hover:text-gray-700 py-1 text-left"
        >
          Load {Math.min(remaining, 5)} more ({remaining} remaining)
        </button>
      )}
    </div>
  );
}

export default function SessionPage({
  params,
}: {
  params: Promise<{ session_id: string }>;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("active");
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [columnLimit, setColumnLimit] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const supabase = useRef(createSupabaseBrowserClient());
  const sessionStatusRef = useRef<SessionStatus>("active");

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    params.then((p) => setSessionId(p.session_id));
  }, [params]);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  useEffect(() => {
    if (!sessionId) return;
    return () => {
      if (sessionStatusRef.current === "active") {
        stopSession(sessionId);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const sb = supabase.current;

    sb.from("sessions")
      .select("status, video_id")
      .eq("id", sessionId)
      .single()
      .then(({ data }) => {
        if (data?.video_id) setVideoId(data.video_id as string);
        if (data?.status === "ended") setSessionStatus("ended");
        else if (data?.status === "stopped") setSessionStatus("stopped");
      });

    sb.from("prompts")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setPrompts(data as PromptRow[]);
          const dis = new Set(
            (data as PromptRow[]).filter((p) => p.dismissed).map((p) => p.id),
          );
          setDismissed(dis);
        }
      });

    const channel = sb
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prompts",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setPrompts((prev) => [payload.new as PromptRow, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const status = (payload.new as { status: string }).status;
          if (status === "ended") setSessionStatus("ended");
          else if (status === "stopped") setSessionStatus("stopped");
          else if (status === "active") setSessionStatus("active");
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [sessionId]);

  async function handleStop() {
    if (!sessionId) return;
    setSessionStatus("stopped");
    await stopSession(sessionId);
  }

  async function handleResume() {
    if (!sessionId) return;
    setResumeError(null);
    try {
      await resumeSession(sessionId);
      setSessionStatus("active");
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Failed to resume");
    }
  }

  async function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    await supabase.current
      .from("prompts")
      .update({ dismissed: true })
      .eq("id", id);
  }

  function loadMore(category: string) {
    setColumnLimit((prev) => ({
      ...prev,
      [category]: (prev[category] ?? 5) + 5,
    }));
  }

  const promptsByCategory = useMemo(() => {
    const map: Record<string, PromptRow[]> = {};
    for (const p of prompts) {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    }
    return map;
  }, [prompts]);

  const orderedCategories = useMemo(() => {
    const present = new Set(Object.keys(promptsByCategory));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const unknown = [...present].filter((c) => !CATEGORY_ORDER.includes(c));
    return [...ordered, ...unknown];
  }, [promptsByCategory]);

  const totalVisible = useMemo(() => {
    return prompts.filter((p) => showDismissed || !dismissed.has(p.id)).length;
  }, [prompts, dismissed, showDismissed]);

  if (!sessionId) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <span className="font-semibold text-gray-900">Tidal</span>
        <span className="text-gray-400 text-sm font-mono">
          {sessionId.slice(0, 8)}
        </span>
        {videoId && (
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Watch on YouTube"
            className="text-red-500 hover:text-red-600"
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
        )}
        <span className="ml-auto text-xs text-gray-400">
          {totalVisible} prompt{totalVisible !== 1 ? "s" : ""}
        </span>
        {sessionStatus === "active" && (
          <button
            onClick={handleStop}
            className="text-sm text-red-500 hover:text-red-700 font-medium"
          >
            Stop
          </button>
        )}
        {sessionStatus === "stopped" && (
          <>
            <button
              onClick={handleResume}
              className="text-sm text-green-600 hover:text-green-800 font-medium"
            >
              Resume
            </button>
            {resumeError && (
              <span className="text-xs text-red-500">{resumeError}</span>
            )}
          </>
        )}
        {sessionStatus === "ended" && (
          <span className="text-sm text-gray-400">Ended</span>
        )}
        <LogoutButton />
      </header>

      <main className="px-4 py-6">
        <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
          <Link href="/" className="underline hover:text-gray-700">
            New session
          </Link>
          <Link href="/sessions" className="underline hover:text-gray-700">
            All sessions
          </Link>
          {dismissed.size > 0 && (
            <button
              onClick={() => setShowDismissed((v) => !v)}
              className="underline hover:text-gray-700"
            >
              {showDismissed
                ? "Hide dismissed"
                : `Show dismissed (${dismissed.size})`}
            </button>
          )}
        </div>

        {prompts.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-16">
            Waiting for prompts… chat analysis will begin shortly.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
          {orderedCategories.map((category) => (
            <CategoryColumn
              key={category}
              category={category}
              prompts={promptsByCategory[category] ?? []}
              dismissed={dismissed}
              limit={columnLimit[category] ?? 5}
              showDismissed={showDismissed}
              onDismiss={dismiss}
              onLoadMore={() => loadMore(category)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
