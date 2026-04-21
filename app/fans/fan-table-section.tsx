"use client";

import { useState } from "react";
import { formatTimestamp } from "@/lib/utils";
import { FanTableSkeleton } from "./skeletons";
import type { SortCol, SortDir } from "@/app/api/fans-table/route";

type FanSummary = {
  id: string;
  ytId: string;
  name: string | null;
  videosCount: number;
  messagesCount: number;
  latestMessageTime: string | null;
  spendProb: number | null;
};

const FANS_PER_PAGE = 20;

function SortIcon({
  col,
  sortCol,
  sortDir,
}: {
  col: SortCol;
  sortCol: SortCol;
  sortDir: SortDir;
}) {
  if (col !== sortCol) return <span className="ml-1 text-slate-600">↕</span>;
  return (
    <span className="ml-1 text-cyan-400">{sortDir === "asc" ? "↑" : "↓"}</span>
  );
}

export function FanTableSection({
  initialFans,
  initialTotal,
}: {
  initialFans: FanSummary[];
  initialTotal: number;
}) {
  const [fans, setFans] = useState(initialFans);
  const [total, setTotal] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const totalPages = Math.max(1, Math.ceil(total / FANS_PER_PAGE));
  const pageStart = (currentPage - 1) * FANS_PER_PAGE;
  const pageLabelStart = total === 0 ? 0 : pageStart + 1;
  const pageLabelEnd = Math.min(pageStart + fans.length, total);

  async function fetchPage(page: number, col: SortCol, dir: SortDir) {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/fans-table?page=${page}&sortCol=${col}&sortDir=${dir}`,
      );
      const data = await res.json();
      setFans(data.fans);
      setTotal(data.totalCount);
      setCurrentPage(page);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSort(col: SortCol) {
    const nextDir: SortDir =
      col === sortCol && sortDir === "asc" ? "desc" : "asc";
    setSortCol(col);
    setSortDir(nextDir);
    fetchPage(1, col, nextDir);
  }

  function goToPage(page: number) {
    fetchPage(page, sortCol, sortDir);
  }

  type ColDef = { key: SortCol; label: string };
  const cols: ColDef[] = [
    { key: "yt_id", label: "YouTube Fan ID" },
    { key: "name", label: "Name" },
    { key: "videos_count", label: "Videos with Messages" },
    { key: "messages_count", label: "Chat Messages" },
    { key: "latest_message_time", label: "Latest Message" },
    { key: "spend_prob", label: "Spend Prob" },
  ];

  if (isLoading) {
    return <FanTableSkeleton />;
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Fan Table</h2>
          <p className="mt-1 text-sm text-slate-400">
            Fan identity and chat activity across tracked videos.
          </p>
        </div>
        <div className="text-right text-sm text-slate-400">
          <p>
            Showing {pageLabelStart}–{pageLabelEnd} of {total}
          </p>
          <p>
            Page {total === 0 ? 0 : currentPage} of{" "}
            {total === 0 ? 0 : totalPages}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              {cols.map(({ key, label }) => (
                <th
                  key={key}
                  className="cursor-pointer select-none border-b border-slate-800 px-4 py-3 font-medium transition hover:text-slate-200"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon col={key} sortCol={sortCol} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fans.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-slate-500"
                  colSpan={cols.length}
                >
                  No tracked fans yet.
                </td>
              </tr>
            ) : (
              fans.map((fan) => (
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
                  <td className="border-b border-slate-900 px-4 py-4">
                    {fan.spendProb !== null ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs tabular-nums ${
                          fan.spendProb >= 0.7
                            ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                            : fan.spendProb >= 0.4
                              ? "border-fuchsia-600/30 bg-fuchsia-600/15 text-fuchsia-400"
                              : "border-slate-700 bg-slate-800/60 text-slate-500"
                        }`}
                      >
                        {Math.round(fan.spendProb * 100)}%
                      </span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-800 pt-4">
        <div className="text-sm text-slate-500">
          {FANS_PER_PAGE} fans per page
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
    </section>
  );
}
