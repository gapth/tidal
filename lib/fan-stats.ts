type MessageRow = {
  fan_id: string;
  yt_video_id: string;
  time: string;
};

export type FanStats = {
  videos: Set<string>;
  messagesCount: number;
  latestMessageTime: string | null;
};

export function aggregateMessageStatsByFanId(
  messages: MessageRow[],
): Map<string, FanStats> {
  const statsByFanId = new Map<string, FanStats>();

  for (const message of messages) {
    const stats = statsByFanId.get(message.fan_id) ?? {
      videos: new Set<string>(),
      messagesCount: 0,
      latestMessageTime: null,
    };

    stats.videos.add(message.yt_video_id);
    stats.messagesCount += 1;

    if (!stats.latestMessageTime || message.time > stats.latestMessageTime) {
      stats.latestMessageTime = message.time;
    }

    statsByFanId.set(message.fan_id, stats);
  }

  return statsByFanId;
}
