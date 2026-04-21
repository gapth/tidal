"use client";

import { useState } from "react";
import type { TopFansEntry } from "@/app/api/top-fans/route";
import { TopFansSkeleton } from "./skeletons";

export type { TopFansEntry };

const TOP_FANS_PER_PAGE = 10;

function SpendProbCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-700">—</span>;
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.7
      ? "text-violet-300"
      : value >= 0.4
        ? "text-fuchsia-400"
        : "text-slate-500";
  return <span className={`tabular-nums ${cls}`}>{pct}%</span>;
}

const SECTION_COPY = {
  nudge: {
    title: "Fans to Nudge",
    subtitle:
      "Chatted in the last stream but made no paid action · sorted by spend likelihood",
    empty: "No fans from the last stream found.",
  },
  supporter: {
    title: "Top Supporters",
    subtitle: "All-time supporters · sorted by support count",
    empty: "No supporters tracked yet.",
  },
};

const NUDGE_COLS = ["#", "Name", "Videos", "Messages", "Spend Prob"];
const SUPPORTER_COLS = [
  "#",
  "Name",
  "Videos",
  "Videos w/ Paid",
  "Messages",
  "Paid Messages",
  "Spend Prob",
];

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
  const cols = type === "nudge" ? NUDGE_COLS : SUPPORTER_COLS;

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
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{copy.title}</h2>
          <p className="mt-1 text-sm text-slate-400">{copy.subtitle}</p>
        </div>
        {total > 0 && (
          <span className="text-xs text-slate-500">{total} fans</span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-36 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/40 text-sm text-slate-500">
          {copy.empty}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-slate-400">
                  {cols.map((col) => (
                    <th
                      key={col}
                      className="border-b border-slate-800 px-4 py-3 font-medium"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const displayName = entry.name?.trim() || "Anonymous Fan";
                  const rank = rankOffset + index + 1;
                  return (
                    <tr key={entry.fanId} className="text-slate-200">
                      <td className="border-b border-slate-900 px-4 py-4 font-mono text-xs text-slate-500">
                        {rank}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4 font-medium">
                        {displayName}
                      </td>
                      <td className="border-b border-slate-900 px-4 py-4 tabular-nums">
                        {entry.videosCount}
                      </td>
                      {type === "supporter" && (
                        <td className="border-b border-slate-900 px-4 py-4 tabular-nums">
                          {entry.videosWithPaidEvents ?? 0}
                        </td>
                      )}
                      <td className="border-b border-slate-900 px-4 py-4 tabular-nums">
                        {entry.messagesCount}
                      </td>
                      {type === "supporter" && (
                        <td className="border-b border-slate-900 px-4 py-4 tabular-nums">
                          {entry.paidEventCount ?? 0}
                        </td>
                      )}
                      <td className="border-b border-slate-900 px-4 py-4">
                        <SpendProbCell value={entry.spendProb} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
