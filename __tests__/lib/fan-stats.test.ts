import { describe, it, expect } from "vitest";
import { aggregateMessageStatsByFanId } from "@/lib/fan-stats";

const msg = (fanId: string, videoId: string, time: string) => ({
  fan_id: fanId,
  yt_video_id: videoId,
  time,
});

describe("aggregateMessageStatsByFanId", () => {
  it("returns an empty map for no messages", () => {
    expect(aggregateMessageStatsByFanId([])).toEqual(new Map());
  });

  it("counts messages per fan", () => {
    const messages = [
      msg("fan-1", "video-a", "2024-06-15T10:00:00Z"),
      msg("fan-1", "video-a", "2024-06-15T10:01:00Z"),
      msg("fan-2", "video-a", "2024-06-15T10:02:00Z"),
    ];
    const stats = aggregateMessageStatsByFanId(messages);
    expect(stats.get("fan-1")?.messagesCount).toBe(2);
    expect(stats.get("fan-2")?.messagesCount).toBe(1);
  });

  it("deduplicates videos per fan", () => {
    const messages = [
      msg("fan-1", "video-a", "2024-06-15T10:00:00Z"),
      msg("fan-1", "video-a", "2024-06-15T10:01:00Z"),
      msg("fan-1", "video-b", "2024-06-15T10:02:00Z"),
    ];
    const stats = aggregateMessageStatsByFanId(messages);
    expect(stats.get("fan-1")?.videos.size).toBe(2);
  });

  it("tracks the latest message time", () => {
    const messages = [
      msg("fan-1", "video-a", "2024-06-15T10:00:00Z"),
      msg("fan-1", "video-a", "2024-06-15T10:05:00Z"),
      msg("fan-1", "video-a", "2024-06-15T10:02:00Z"),
    ];
    const stats = aggregateMessageStatsByFanId(messages);
    expect(stats.get("fan-1")?.latestMessageTime).toBe("2024-06-15T10:05:00Z");
  });

  it("initializes latestMessageTime with the first message", () => {
    const messages = [msg("fan-1", "video-a", "2024-06-15T09:00:00Z")];
    const stats = aggregateMessageStatsByFanId(messages);
    expect(stats.get("fan-1")?.latestMessageTime).toBe("2024-06-15T09:00:00Z");
  });

  it("handles multiple fans independently", () => {
    const messages = [
      msg("fan-1", "video-a", "2024-06-15T10:00:00Z"),
      msg("fan-2", "video-b", "2024-06-15T11:00:00Z"),
    ];
    const stats = aggregateMessageStatsByFanId(messages);
    expect(stats.size).toBe(2);
    expect(stats.get("fan-1")?.videos.has("video-a")).toBe(true);
    expect(stats.get("fan-2")?.videos.has("video-b")).toBe(true);
  });
});
