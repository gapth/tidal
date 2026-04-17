"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandLink } from "@/components/brand-link";
import { SignOutButton } from "@/components/sign-out-button";

type Message = {
  ytId: string;
  fanId: string;
  name: string | null;
  text: string | null;
  time: string;
};

type PollResponse = {
  nextPageToken: string | null;
  messages: Message[];
  error?: string;
};

export default function HomePage() {
  const [videoId, setVideoId] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [intervalInput, setIntervalInput] = useState("30");
  const [isTracking, setIsTracking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [totalFans, setTotalFans] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const nextPageTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const fetchFansCount = async () => {
      try {
        const response = await fetch("/api/fans", { cache: "no-store" });
        const data = (await response.json()) as {
          totalFans?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load fan count.");
        }

        if (!cancelled) {
          setTotalFans(data.totalFans ?? 0);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load fan count.",
          );
        }
      }
    };

    if (!isTracking) {
      void fetchFansCount();
      return () => {
        cancelled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }

    const poll = async () => {
      try {
        const response = await fetch("/api/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            nextPageToken: nextPageTokenRef.current,
          }),
        });

        const data = (await response.json()) as PollResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Polling request failed.");
        }

        if (cancelled) {
          return;
        }

        nextPageTokenRef.current = data.nextPageToken ?? null;
        setMessages((current) => {
          const knownIds = new Set(current.map((message) => message.ytId));
          const incoming = data.messages.filter(
            (message) => !knownIds.has(message.ytId),
          );

          return [...incoming, ...current].slice(0, 250);
        });
        setError(null);
        await fetchFansCount();
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Polling request failed.",
          );
        }
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(poll, intervalSeconds * 1000);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [intervalSeconds, isTracking, videoId]);

  const toggleTracking = () => {
    if (!isTracking) {
      nextPageTokenRef.current = null;
      setMessages([]);
      setError(null);
    }

    setIsTracking((current) => !current);
  };

  const renderDisplayName = (name: string | null) => {
    return name?.trim() || "Anonymous Fan";
  };

  const commitIntervalInput = (value: string) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      setIntervalInput(String(intervalSeconds));
      return;
    }

    const parsedValue = Number(trimmedValue);
    const nextInterval = Number.isFinite(parsedValue)
      ? Math.max(1, Math.round(parsedValue))
      : intervalSeconds;

    setIntervalSeconds(nextInterval);
    setIntervalInput(String(nextInterval));
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <BrandLink />
              <h1 className="text-3xl font-semibold text-white">
                YouTube Fan Tracker
              </h1>
              <p className="max-w-2xl text-sm text-slate-400">
                The browser owns the polling loop, so each request stays short
                and avoids long-running serverless execution.
              </p>
              <SignOutButton />
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                Total Fans
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {totalFans}
              </p>
              <Link
                className="mt-4 inline-flex rounded-full border border-cyan-400/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-cyan-200 transition hover:border-cyan-300 hover:text-white"
                href="/fans"
              >
                View Fans
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Video ID
                </span>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                  placeholder="Enter a live YouTube video ID"
                  value={videoId}
                  onChange={(event) => setVideoId(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Poll Interval (seconds)
                </span>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                  min={1}
                  step={1}
                  type="number"
                  value={intervalInput}
                  onBlur={(event) => commitIntervalInput(event.target.value)}
                  onChange={(event) => setIntervalInput(event.target.value)}
                />
              </label>

              <button
                className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                disabled={!videoId.trim()}
                onClick={toggleTracking}
                type="button"
              >
                {isTracking ? "Stop Tracking" : "Start Tracking"}
              </button>

              {error ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              ) : null}
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Live Messages
                </h2>
                <p className="text-sm text-slate-400">
                  Latest messages are prepended as each poll completes.
                </p>
              </div>
              <p className="text-sm text-slate-500">{messages.length} loaded</p>
            </div>

            <div className="h-[520px] space-y-3 overflow-y-auto pr-2">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-800 text-sm text-slate-500">
                  No messages yet.
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.ytId}
                    className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-xs font-semibold text-cyan-300">
                      {renderDisplayName(message.name).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-white">
                          {renderDisplayName(message.name)}
                        </p>
                        <time className="shrink-0 text-xs text-slate-500">
                          {new Date(message.time).toLocaleTimeString()}
                        </time>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        {message.text?.trim() || "No message text"}
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
