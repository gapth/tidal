"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";

type PromptRow = {
  id: string;
  session_id: string;
  source: string;
  category: string;
  content: string;
  dismissed: boolean;
  created_at: string;
};

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

export default function SessionPage({
  params,
}: {
  params: Promise<{ session_id: string }>;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const supabase = useRef(createSupabaseBrowserClient());
  const channelRef = useRef<ReturnType<typeof supabase.current.channel> | null>(
    null,
  );

  // Unwrap params (Next.js 15 async params)
  useEffect(() => {
    params.then((p) => setSessionId(p.session_id));
  }, [params]);

  useEffect(() => {
    if (!sessionId) return;
    const sb = supabase.current;

    // Load existing prompts
    sb.from("prompts")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setPrompts(data as PromptRow[]);
          const dismissed = new Set(
            (data as PromptRow[]).filter((p) => p.dismissed).map((p) => p.id),
          );
          setDismissed(dismissed);
        }
      });

    // Subscribe to new prompts via Realtime
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
      .subscribe();

    channelRef.current = channel;
    return () => {
      sb.removeChannel(channel);
    };
  }, [sessionId]);

  async function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    await supabase.current
      .from("prompts")
      .update({ dismissed: true })
      .eq("id", id);
  }

  if (!sessionId) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <span className="font-semibold text-gray-900">Tidal</span>
        <span className="text-gray-400 text-sm font-mono">
          {sessionId.slice(0, 8)}
        </span>
        <span className="ml-auto text-xs text-gray-400">
          {prompts.length} prompt{prompts.length !== 1 ? "s" : ""}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {prompts.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-16">
            Waiting for prompts… chat analysis will begin shortly.
          </p>
        )}

        {prompts.map((p) => {
          const style = categoryStyle(p.category);
          const isDismissed = dismissed.has(p.id);
          return (
            <div
              key={p.id}
              className={`bg-white rounded-lg border border-gray-200 px-4 py-3 transition-opacity ${isDismissed ? "opacity-40" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                    >
                      {style.label}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {p.source}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 leading-snug">
                    {p.content}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-xs text-gray-400">
                    {relativeTime(p.created_at)}
                  </span>
                  {!isDismissed && (
                    <button
                      onClick={() => dismiss(p.id)}
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
      </main>
    </div>
  );
}
