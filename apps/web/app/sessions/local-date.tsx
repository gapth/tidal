"use client";

export function LocalDate({ iso }: { iso: string }) {
  return (
    <span className="text-xs text-gray-500">
      {new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(iso))}
    </span>
  );
}
