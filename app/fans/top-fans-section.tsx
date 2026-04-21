"use client";

import { useState } from "react";
import { formatTimestamp } from "@/lib/utils";
import type { SignalBreakdown } from "@/lib/scoring";
import { TopFansSkeleton } from "./skeletons";

export type TopFansEntry = {
  fanId: string;
  name: string | null;
  score: number;
  signals: SignalBreakdown[];
  computedAt: string;
  spendProb: number | null;
};

const TOP_FANS_PER_PAGE = 10;

function RankedFanCard({
  rank,
  entry,
  type,
}: {
  rank: number;
  entry: TopFansEntry;
  type: "nudge" | "supporter";
}) {
  const displayName = entry.name?.trim() || "Anonymous Fan";
  const topSignals = [...entry.signals]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const scoreColor =
    type === "supporter"
      ? entry.score >= 70
        ? "border-amber-500/30 bg-amber-500/20 text-amber-300"
        : entry.score >= 40
          ? "border-yellow-600/30 bg-yellow-600/20 text-yellow-400"
          : "border-slate-600 bg-slate-700/50 text-slate-400"
      : entry.score >= 70
        ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
        : entry.score >= 40
          ? "border-amber-500/30 bg-amber-500/20 text-amber-300"
          : "border-slate-600 bg-slate-700/50 text-slate-400";

  return (
    <li className="flex items-start gap-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
      <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-sm text-slate-500">
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-white">{displayName}</span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreColor}`}
          >
            {entry.score}
          </span>
          {entry.spendProb !== null && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums ${
                entry.spendProb >= 0.7
                  ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                  : entry.spendProb >= 0.4
                    ? "border-fuchsia-600/30 bg-fuchsia-600/15 text-fuchsia-400"
                    : "border-slate-700 bg-slate-800/60 text-slate-500"
              }`}
            >
              {Math.round(entry.spendProb * 100)}% spend
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {topSignals.map((signal) => (
            <span
              key={signal.signal}
              className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300"
            >
              {signal.label}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

const SECTION_COPY = {
  nudge: {
    title: "Fans to Nudge",
    subtitle: "Ranked by conversion likelihood",
  },
  supporter: {
    title: "Top Supporters",
    subtitle: "Ranked by support level · call out and thank these fans",
  },
};

export function TopFansSection({
  type,
  initialEntries,
  initialTotal,
}: {
  type: "nudge" | "supporter";
  initialEntries: TopFansEntry[];
  initialTotal: number;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / TOP_FANS_PER_PAGE));
  const rankOffset = (currentPage - 1) * TOP_FANS_PER_PAGE;
  const copy = SECTION_COPY[type];

  async function goToPage(page: number) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/top-fans?page=${page}&type=${type}`);
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.totalCount);
      setCurrentPage(page);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <TopFansSkeleton />;
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {entries.length > 0
              ? `${copy.subtitle} · scored ${formatTimestamp(entries[0].computedAt)}`
              : "Scores are computed every 6 hours via a background job."}
          </p>
        </div>
        {total > 0 && (
          <span className="text-xs text-slate-500">{total} fans ranked</span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="mt-4 flex min-h-36 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-800 bg-slate-950/40 text-sm text-slate-500">
          <span>Scores not yet computed.</span>
          <span className="text-xs">
            Trigger a run:{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
              POST /api/compute-scores
            </code>
          </span>
        </div>
      ) : (
        <>
          <ol className="mt-4 flex flex-col gap-2">
            {entries.map((entry, index) => (
              <RankedFanCard
                key={entry.fanId}
                rank={rankOffset + index + 1}
                entry={entry}
                type={type}
              />
            ))}
          </ol>

          <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-800 pt-4">
            <div className="text-sm text-slate-500">
              {TOP_FANS_PER_PAGE} per page · showing {rankOffset + 1}–
              {rankOffset + entries.length} of {total}
            </div>
            <div className="flex items-center gap-3">
              {currentPage > 1 ? (
                <button
                  className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                  onClick={() => goToPage(currentPage - 1)}
                >
                  Previous
                </button>
              ) : (
                <span className="inline-flex rounded-full border border-slate-800 px-4 py-2 text-sm font-medium text-slate-600">
                  Previous
                </span>
              )}
              {currentPage < totalPages ? (
                <button
                  className="inline-flex rounded-full border border-cyan-400/30 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-300 hover:text-white"
                  onClick={() => goToPage(currentPage + 1)}
                >
                  Next
                </button>
              ) : (
                <span className="inline-flex rounded-full border border-slate-800 px-4 py-2 text-sm font-medium text-slate-600">
                  Next
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
