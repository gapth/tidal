"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function parseVideoId(input: string): string | null {
  const s = input.trim();
  // youtu.be/ID or youtu.be/live/ID
  let m = s.match(/youtu\.be\/(?:live\/)?([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // ?v=ID or &v=ID
  m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // /live/ID
  m = s.match(/\/live\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // bare 11-char ID
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const videoId = parseVideoId(url);
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
      router.push(`/session/${session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full px-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Tidal</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Real-time sensemaking for live streams. Paste a YouTube live URL to
          start.
        </p>

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
