import { readFileSync } from "fs";
import type { ChatMessage } from "./types.ts";

export function loadMessages(path: string): ChatMessage[] {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const seen = new Set<string>();
  const unique: ChatMessage[] = [];
  for (const line of lines) {
    const m = JSON.parse(line) as ChatMessage;
    if (!seen.has(m.messageId)) {
      seen.add(m.messageId);
      unique.push(m);
    }
  }
  unique.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  return unique;
}

export interface Tick {
  tickTimeMs: number;
  newMessages: ChatMessage[];
}

export function buildTicks(messages: ChatMessage[], intervalMs = 2500): Tick[] {
  if (messages.length === 0) return [];
  const startMs = new Date(messages[0].publishedAt).getTime();
  const endMs = new Date(messages[messages.length - 1].publishedAt).getTime();
  const ticks: Tick[] = [];
  let msgIdx = 0;
  for (let t = startMs; t <= endMs + intervalMs; t += intervalMs) {
    const batch: ChatMessage[] = [];
    while (
      msgIdx < messages.length &&
      new Date(messages[msgIdx].publishedAt).getTime() <= t
    ) {
      batch.push(messages[msgIdx++]);
    }
    if (batch.length > 0) {
      ticks.push({ tickTimeMs: t, newMessages: batch });
    }
  }
  return ticks;
}

export function getWindow(
  messages: ChatMessage[],
  beforeMs: number,
  windowMs: number,
): ChatMessage[] {
  return messages.filter((m) => {
    const t = new Date(m.publishedAt).getTime();
    return t <= beforeMs && t > beforeMs - windowMs;
  });
}
