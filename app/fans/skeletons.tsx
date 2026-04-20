export function TopFansSkeleton() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-4 w-72 animate-pulse rounded bg-slate-800/60" />
        </div>
        <div className="h-4 w-20 animate-pulse rounded bg-slate-800/60" />
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="flex items-start gap-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3"
          >
            <div className="mt-1 h-4 w-4 animate-pulse rounded bg-slate-800" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
                <div className="h-5 w-10 animate-pulse rounded-full bg-slate-800" />
              </div>
              <div className="flex gap-1.5">
                <div className="h-5 w-24 animate-pulse rounded-full bg-slate-800/60" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-slate-800/60" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-slate-800/60" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FanTableSkeleton() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-28 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-4 w-64 animate-pulse rounded bg-slate-800/60" />
        </div>
        <div className="space-y-1 text-right">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-800/60" />
          <div className="h-4 w-20 animate-pulse rounded bg-slate-800/60" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {Array.from({ length: 5 }).map((_, i) => (
                <th key={i} className="border-b border-slate-800 px-4 py-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-800" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="border-b border-slate-900 px-4 py-4">
                    <div className="h-4 w-full max-w-[120px] animate-pulse rounded bg-slate-800/60" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
