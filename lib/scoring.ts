export type SignalKey =
  | "streamAttendance"
  | "chatVolumePerStream"
  | "recency"
  | "directAddress"
  | "noMonetization"
  | "relationshipDuration";

export type SignalBreakdown = {
  signal: SignalKey;
  rawValue: number;
  normalizedScore: number;
  weight: number;
  contribution: number;
  label: string;
};

export type ScoreBreakdown = {
  fanId: string;
  totalScore: number;
  signals: SignalBreakdown[];
  isEligible: boolean;
  ineligibleReason?: string;
};

export type FanScoringInput = {
  fanId: string;
  streamsAttended: number;
  totalMessages: number;
  earliestMessageTime: string;
  latestMessageTime: string;
  directAddressCount: number;
  hasPaidEvent: boolean;
};

// Adjust these to tune ranking quality based on qualitative feedback.
const WEIGHTS: Record<SignalKey, number> = {
  streamAttendance: 0.3,
  chatVolumePerStream: 0.2,
  recency: 0.2,
  directAddress: 0.15,
  noMonetization: 0.1,
  relationshipDuration: 0.05,
};

const CAPS = {
  streamAttendance: 20,
  chatVolumePerStream: 10,
  recencyDays: 30,
  directAddress: 5,
  relationshipWeeks: 12,
};

export function scoreFan(input: FanScoringInput): ScoreBreakdown {
  if (input.totalMessages === 0) {
    return {
      fanId: input.fanId,
      totalScore: 0,
      signals: [],
      isEligible: false,
      ineligibleReason: "No messages recorded",
    };
  }

  const now = Date.now();
  const daysSinceLast =
    (now - new Date(input.latestMessageTime).getTime()) / 86_400_000;
  const weeksSinceFirst =
    (now - new Date(input.earliestMessageTime).getTime()) / (86_400_000 * 7);
  const msgsPerStream =
    input.streamsAttended > 0
      ? input.totalMessages / input.streamsAttended
      : 0;

  const rawSignals: Array<{
    key: SignalKey;
    raw: number;
    score: number;
    label: string;
  }> = [
    {
      key: "streamAttendance",
      raw: input.streamsAttended,
      score: clamp01(input.streamsAttended / CAPS.streamAttendance),
      label: `${input.streamsAttended} stream${input.streamsAttended === 1 ? "" : "s"} attended`,
    },
    {
      key: "chatVolumePerStream",
      raw: msgsPerStream,
      score: clamp01(msgsPerStream / CAPS.chatVolumePerStream),
      label: `${(Math.round(msgsPerStream * 10) / 10).toFixed(1)} msgs/stream`,
    },
    {
      key: "recency",
      raw: daysSinceLast,
      score: clamp01(1 - daysSinceLast / CAPS.recencyDays),
      label:
        daysSinceLast < 1
          ? "seen today"
          : `seen ${Math.floor(daysSinceLast)} day${Math.floor(daysSinceLast) === 1 ? "" : "s"} ago`,
    },
    {
      key: "directAddress",
      raw: input.directAddressCount,
      score: clamp01(input.directAddressCount / CAPS.directAddress),
      label:
        input.directAddressCount === 0
          ? "no direct messages"
          : `${input.directAddressCount} direct message${input.directAddressCount === 1 ? "" : "s"}`,
    },
    {
      key: "noMonetization",
      raw: input.hasPaidEvent ? 0 : 1,
      score: input.hasPaidEvent ? 0 : 1,
      label: input.hasPaidEvent ? "has paid before" : "never paid",
    },
    {
      key: "relationshipDuration",
      raw: weeksSinceFirst,
      score: clamp01(weeksSinceFirst / CAPS.relationshipWeeks),
      label: `fan for ${Math.floor(weeksSinceFirst)} week${Math.floor(weeksSinceFirst) === 1 ? "" : "s"}`,
    },
  ];

  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  const signals: SignalBreakdown[] = rawSignals.map(({ key, raw, score, label }) => ({
    signal: key,
    rawValue: raw,
    normalizedScore: score,
    weight: WEIGHTS[key],
    contribution: score * WEIGHTS[key],
    label,
  }));

  const weightedSum = signals.reduce((sum, s) => sum + s.contribution, 0);
  const totalScore = Math.round((weightedSum / totalWeight) * 100);

  return { fanId: input.fanId, totalScore, signals, isEligible: true };
}

type MessageForScoring = {
  fan_id: string;
  yt_video_id: string;
  time: string;
  text: string | null;
  paid_event_type: string | null;
};

export function buildScoringInputs(
  fans: Array<{ id: string }>,
  messages: MessageForScoring[],
): FanScoringInput[] {
  type Acc = {
    videos: Set<string>;
    totalMessages: number;
    earliestTime: string;
    latestTime: string;
    directAddressCount: number;
    hasPaidEvent: boolean;
  };

  const acc = new Map<string, Acc>();

  for (const msg of messages) {
    const entry = acc.get(msg.fan_id) ?? {
      videos: new Set<string>(),
      totalMessages: 0,
      earliestTime: msg.time,
      latestTime: msg.time,
      directAddressCount: 0,
      hasPaidEvent: false,
    };

    entry.videos.add(msg.yt_video_id);
    entry.totalMessages += 1;
    if (msg.time < entry.earliestTime) entry.earliestTime = msg.time;
    if (msg.time > entry.latestTime) entry.latestTime = msg.time;
    if (msg.text && isDirectAddress(msg.text)) entry.directAddressCount += 1;
    if (msg.paid_event_type !== null) entry.hasPaidEvent = true;

    acc.set(msg.fan_id, entry);
  }

  return fans.map((fan) => {
    const data = acc.get(fan.id);
    if (!data) {
      return {
        fanId: fan.id,
        streamsAttended: 0,
        totalMessages: 0,
        earliestMessageTime: new Date().toISOString(),
        latestMessageTime: new Date().toISOString(),
        directAddressCount: 0,
        hasPaidEvent: false,
      };
    }
    return {
      fanId: fan.id,
      streamsAttended: data.videos.size,
      totalMessages: data.totalMessages,
      earliestMessageTime: data.earliestTime,
      latestMessageTime: data.latestTime,
      directAddressCount: data.directAddressCount,
      hasPaidEvent: data.hasPaidEvent,
    };
  });
}

// Extend this predicate as qualitative feedback identifies more patterns.
function isDirectAddress(text: string): boolean {
  return text.includes("?") || /^@\w/.test(text);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
