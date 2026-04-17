import { describe, it, expect } from "vitest";
import { normalizeRawMessages } from "@/lib/youtube";
import type { YouTubeChatResponse } from "@/lib/youtube";

const makeItem = (
  overrides: Partial<NonNullable<YouTubeChatResponse["items"]>[0]> = {},
) => ({
  id: "msg-1",
  snippet: { displayMessage: "Hello!", publishedAt: "2024-06-15T10:00:00Z" },
  authorDetails: { channelId: "channel-abc", displayName: "Alice" },
  ...overrides,
});

describe("normalizeRawMessages", () => {
  it("returns an empty array for undefined items", () => {
    expect(normalizeRawMessages(undefined)).toEqual([]);
  });

  it("returns an empty array for empty items", () => {
    expect(normalizeRawMessages([])).toEqual([]);
  });

  it("maps a well-formed item to a NormalizedMessage", () => {
    const result = normalizeRawMessages([makeItem()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ytId: "msg-1",
      fanId: "channel-abc",
      name: "Alice",
      text: "Hello!",
      time: "2024-06-15T10:00:00Z",
    });
  });

  it("drops items with a missing channel ID", () => {
    const item = makeItem({
      authorDetails: { channelId: "", displayName: "Bob" },
    });
    expect(normalizeRawMessages([item])).toHaveLength(0);
  });

  it("drops items with a missing message ID", () => {
    const item = makeItem({ id: "" });
    expect(normalizeRawMessages([item])).toHaveLength(0);
  });

  it("falls back to null for missing displayName", () => {
    const item = makeItem({ authorDetails: { channelId: "channel-abc" } });
    const result = normalizeRawMessages([item]);
    expect(result[0].name).toBeNull();
  });

  it("falls back to null for missing displayMessage", () => {
    const item = makeItem({ snippet: { publishedAt: "2024-06-15T10:00:00Z" } });
    const result = normalizeRawMessages([item]);
    expect(result[0].text).toBeNull();
  });

  it("falls back to a current timestamp when publishedAt is absent", () => {
    const before = Date.now();
    const item = makeItem({ snippet: { displayMessage: "Hi" } });
    const result = normalizeRawMessages([item]);
    const after = Date.now();
    const resultTime = new Date(result[0].time).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
  });

  it("filters out invalid items while keeping valid ones", () => {
    const valid = makeItem();
    const invalid = makeItem({ id: "" });
    expect(normalizeRawMessages([valid, invalid])).toHaveLength(1);
  });
});
