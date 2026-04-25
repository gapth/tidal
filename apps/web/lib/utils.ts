export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No messages yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function parsePageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

// Returns current unchanged when input is empty or non-numeric.
export function normalizeInterval(raw: string, current: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return current;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : current;
}
