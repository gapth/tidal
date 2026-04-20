import { describe, it, expect } from "vitest";
import { scoreFan, buildScoringInputs, type FanScoringInput } from "@/lib/scoring";

const NOW = new Date("2026-04-20T12:00:00Z");

// Returns an ISO timestamp N days before NOW.
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function weeksAgo(n: number): string {
  return daysAgo(n * 7);
}

function baseInput(overrides: Partial<FanScoringInput> = {}): FanScoringInput {
  return {
    fanId: "fan-1",
    streamsAttended: 5,
    totalMessages: 20,
    earliestMessageTime: weeksAgo(6),
    latestMessageTime: daysAgo(2),
    directAddressCount: 2,
    hasPaidEvent: false,
    ...overrides,
  };
}

describe("scoreFan", () => {
  it("returns ineligible with score 0 for a fan with no messages", () => {
    const result = scoreFan(baseInput({ totalMessages: 0 }));
    expect(result.isEligible).toBe(false);
    expect(result.totalScore).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it("returns eligible with a positive score for a fan with messages", () => {
    const result = scoreFan(baseInput());
    expect(result.isEligible).toBe(true);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("scores 0 on noMonetization when fan has paid events", () => {
    const result = scoreFan(baseInput({ hasPaidEvent: true }));
    const signal = result.signals.find((s) => s.signal === "noMonetization");
    expect(signal?.normalizedScore).toBe(0);
    expect(signal?.label).toBe("has paid before");
  });

  it("scores 1 on noMonetization when fan has never paid", () => {
    const result = scoreFan(baseInput({ hasPaidEvent: false }));
    const signal = result.signals.find((s) => s.signal === "noMonetization");
    expect(signal?.normalizedScore).toBe(1);
    expect(signal?.label).toBe("never paid");
  });

  it("caps streamAttendance at score 1 when at or above cap (20 streams)", () => {
    const result = scoreFan(baseInput({ streamsAttended: 20 }));
    const signal = result.signals.find((s) => s.signal === "streamAttendance");
    expect(signal?.normalizedScore).toBe(1);
  });

  it("does not exceed normalizedScore of 1 when streamsAttended exceeds cap", () => {
    const result = scoreFan(baseInput({ streamsAttended: 50 }));
    const signal = result.signals.find((s) => s.signal === "streamAttendance");
    expect(signal?.normalizedScore).toBe(1);
  });

  it("gives near-full recency score when last seen today", () => {
    const result = scoreFan(baseInput({ latestMessageTime: new Date().toISOString() }));
    const signal = result.signals.find((s) => s.signal === "recency");
    expect(signal?.normalizedScore).toBeGreaterThan(0.99);
    expect(signal?.label).toBe("seen today");
  });

  it("gives zero recency score when last seen beyond cap (30 days)", () => {
    const result = scoreFan(baseInput({ latestMessageTime: daysAgo(31) }));
    const signal = result.signals.find((s) => s.signal === "recency");
    expect(signal?.normalizedScore).toBe(0);
  });

  it("totalScore is between 0 and 100 inclusive", () => {
    const result = scoreFan(baseInput());
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("returns 6 signal breakdowns for eligible fans", () => {
    const result = scoreFan(baseInput());
    expect(result.signals).toHaveLength(6);
  });
});

describe("buildScoringInputs", () => {
  const fan = (id: string) => ({ id });

  const msg = (
    fanId: string,
    opts: {
      videoId?: string;
      time?: string;
      text?: string | null;
      paidEventType?: string | null;
    } = {},
  ) => ({
    fan_id: fanId,
    yt_video_id: opts.videoId ?? "video-a",
    time: opts.time ?? daysAgo(1),
    text: opts.text ?? null,
    paid_event_type: opts.paidEventType ?? null,
  });

  it("returns empty array for no fans", () => {
    expect(buildScoringInputs([], [])).toEqual([]);
  });

  it("marks fans with no messages as having 0 totalMessages", () => {
    const inputs = buildScoringInputs([fan("fan-1")], []);
    expect(inputs[0].totalMessages).toBe(0);
  });

  it("counts distinct streams attended", () => {
    const messages = [
      msg("fan-1", { videoId: "video-a" }),
      msg("fan-1", { videoId: "video-a" }),
      msg("fan-1", { videoId: "video-b" }),
    ];
    const inputs = buildScoringInputs([fan("fan-1")], messages);
    expect(inputs[0].streamsAttended).toBe(2);
  });

  it("detects direct-address messages containing '?'", () => {
    const messages = [
      msg("fan-1", { text: "what song is this?" }),
      msg("fan-1", { text: "great stream" }),
    ];
    const inputs = buildScoringInputs([fan("fan-1")], messages);
    expect(inputs[0].directAddressCount).toBe(1);
  });

  it("detects direct-address messages starting with '@'", () => {
    const messages = [msg("fan-1", { text: "@streamer hello!" })];
    const inputs = buildScoringInputs([fan("fan-1")], messages);
    expect(inputs[0].directAddressCount).toBe(1);
  });

  it("sets hasPaidEvent true when any message has a paid_event_type", () => {
    const messages = [
      msg("fan-1", { paidEventType: "superChat" }),
      msg("fan-1"),
    ];
    const inputs = buildScoringInputs([fan("fan-1")], messages);
    expect(inputs[0].hasPaidEvent).toBe(true);
  });

  it("keeps hasPaidEvent false when no paid messages", () => {
    const messages = [msg("fan-1"), msg("fan-1")];
    const inputs = buildScoringInputs([fan("fan-1")], messages);
    expect(inputs[0].hasPaidEvent).toBe(false);
  });

  it("tracks earliest and latest message times correctly", () => {
    const messages = [
      msg("fan-1", { time: daysAgo(10) }),
      msg("fan-1", { time: daysAgo(1) }),
      msg("fan-1", { time: daysAgo(5) }),
    ];
    const inputs = buildScoringInputs([fan("fan-1")], messages);
    expect(inputs[0].earliestMessageTime).toBe(daysAgo(10));
    expect(inputs[0].latestMessageTime).toBe(daysAgo(1));
  });

  it("handles multiple fans independently", () => {
    const messages = [
      msg("fan-1", { videoId: "video-a" }),
      msg("fan-2", { videoId: "video-b" }),
    ];
    const inputs = buildScoringInputs([fan("fan-1"), fan("fan-2")], messages);
    expect(inputs).toHaveLength(2);
    expect(inputs.find((i) => i.fanId === "fan-1")?.streamsAttended).toBe(1);
    expect(inputs.find((i) => i.fanId === "fan-2")?.streamsAttended).toBe(1);
  });
});
