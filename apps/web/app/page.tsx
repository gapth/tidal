"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseYouTubeVideoId } from "@/lib/youtube";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const supabase = useRef(createSupabaseBrowserClient());
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    await supabase.current.auth.signOut();
    router.push("/login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const videoId = parseYouTubeVideoId(url);
    if (!videoId) {
      setError(
        "Couldn't parse a video ID from that URL. Try pasting a YouTube URL or bare video ID.",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Server error ${res.status}`,
        );
      }
      const { session_id } = (await res.json()) as { session_id: string };
      router.push(`/sessions/${session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <button
        onClick={handleLogout}
        className="absolute top-4 right-6 text-sm text-gray-400 hover:text-gray-600"
      >
        Log out
      </button>
      <div className="max-w-md w-full px-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Tidal</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Real-time sensemaking for live streams. Paste a YouTube live URL to
          start.
        </p>
        <div className="mb-6">
          <Link
            href="/sessions"
            className="text-sm text-gray-500 underline hover:text-gray-700"
          >
            View all sessions
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            autoFocus
            disabled={loading}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full bg-gray-900 text-white py-3 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Starting…" : "Start Watching"}
          </button>
        </form>
      </div>
    </div>
  );
}
