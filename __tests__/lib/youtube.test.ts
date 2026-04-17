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

  it("sets paid fields to null for a regular text message", () => {
    const result = normalizeRawMessages([makeItem({ snippet: { type: "textMessageEvent", displayMessage: "Hi", publishedAt: "2024-06-15T10:00:00Z" } })]);
    expect(result[0].paidEventType).toBeNull();
    expect(result[0].paidAmountMicros).toBeNull();
    expect(result[0].paidCurrency).toBeNull();
  });

  it("sets paid fields to null for an item with no snippet type", () => {
    const result = normalizeRawMessages([makeItem()]);
    expect(result[0].paidEventType).toBeNull();
    expect(result[0].paidAmountMicros).toBeNull();
    expect(result[0].paidCurrency).toBeNull();
  });
});

describe("paid event detection", () => {
  const makePaidItem = (
    type: string,
    snippetExtras: Record<string, unknown> = {},
  ) =>
    makeItem({
      snippet: {
        type,
        displayMessage: "test",
        publishedAt: "2024-06-15T10:00:00Z",
        ...snippetExtras,
      },
    });

  it("detects superChatEvent with amount and currency", () => {
    const item = makePaidItem("superChatEvent", {
      superChatDetails: { amountMicros: "5000000", currency: "USD" },
    });
    const [msg] = normalizeRawMessages([item]);
    expect(msg.paidEventType).toBe("superChatEvent");
    expect(msg.paidAmountMicros).toBe(5_000_000);
    expect(msg.paidCurrency).toBe("USD");
  });

  it("detects superStickerEvent with amount and currency", () => {
    const item = makePaidItem("superStickerEvent", {
      superStickerDetails: { amountMicros: "2000000", currency: "EUR" },
    });
    const [msg] = normalizeRawMessages([item]);
    expect(msg.paidEventType).toBe("superStickerEvent");
    expect(msg.paidAmountMicros).toBe(2_000_000);
    expect(msg.paidCurrency).toBe("EUR");
  });

  it("detects membershipGiftingEvent with null amount and currency", () => {
    const item = makePaidItem("membershipGiftingEvent", {
      membershipGiftingDetails: { giftMembershipsCount: 5 },
    });
    const [msg] = normalizeRawMessages([item]);
    expect(msg.paidEventType).toBe("membershipGiftingEvent");
    expect(msg.paidAmountMicros).toBeNull();
    expect(msg.paidCurrency).toBeNull();
  });

  it("detects giftEvent and converts jewelsAmount to micros with JWL currency", () => {
    const item = makePaidItem("giftEvent", {
      giftDetails: { jewelsAmount: 10 },
    });
    const [msg] = normalizeRawMessages([item]);
    expect(msg.paidEventType).toBe("giftEvent");
    expect(msg.paidAmountMicros).toBe(10_000_000);
    expect(msg.paidCurrency).toBe("JWL");
  });

  it("detects giftEvent with missing jewelsAmount — amount null, currency still JWL", () => {
    const item = makePaidItem("giftEvent", { giftDetails: {} });
    const [msg] = normalizeRawMessages([item]);
    expect(msg.paidEventType).toBe("giftEvent");
    expect(msg.paidAmountMicros).toBeNull();
    expect(msg.paidCurrency).toBe("JWL");
  });

  it("detects newSponsorEvent with null amount and currency", () => {
    const item = makePaidItem("newSponsorEvent", {
      newSponsorDetails: { memberLevelName: "Member" },
    });
    const [msg] = normalizeRawMessages([item]);
    expect(msg.paidEventType).toBe("newSponsorEvent");
    expect(msg.paidAmountMicros).toBeNull();
    expect(msg.paidCurrency).toBeNull();
  });
});
