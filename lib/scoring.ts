type NudgeSignalKey =
  | "streamAttendance"
  | "chatVolumePerStream"
  | "recency"
  | "directAddress"
  | "relationshipDuration";

type SupporterSignalKey =
  | "supportEventCount"
  | "supportRecency"
  | "supportConsistency"
  | "supportDuration";

export type SignalKey = NudgeSignalKey | SupporterSignalKey;

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
  paidEventCount: number;
  streamsWithPaidEvents: number;
  lastPaidEventTime: string | null;
  firstPaidEventTime: string | null;
};

const NUDGE_WEIGHTS: Record<NudgeSignalKey, number> = {
  streamAttendance: 0.35,
  chatVolumePerStream: 0.25,
  recency: 0.2,
  directAddress: 0.15,
  relationshipDuration: 0.05,
};

const SUPPORTER_WEIGHTS: Record<SupporterSignalKey, number> = {
  supportEventCount: 0.35,
  supportRecency: 0.3,
  supportConsistency: 0.25,
  supportDuration: 0.1,
};

const CAPS = {
  streamAttendance: 20,
  chatVolumePerStream: 10,
  recencyDays: 30,
  directAddress: 5,
  relationshipWeeks: 12,
  supportEventCount: 10,
  supportRecencyDays: 30,
  supportDurationWeeks: 12,
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

  if (input.hasPaidEvent) {
    return {
      fanId: input.fanId,
      totalScore: 0,
      signals: [],
      isEligible: false,
      ineligibleReason: "Is a supporter",
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
    key: NudgeSignalKey;
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
      key: "relationshipDuration",
      raw: weeksSinceFirst,
      score: clamp01(weeksSinceFirst / CAPS.relationshipWeeks),
      label: `fan for ${Math.floor(weeksSinceFirst)} week${Math.floor(weeksSinceFirst) === 1 ? "" : "s"}`,
    },
  ];

  const totalWeight = Object.values(NUDGE_WEIGHTS).reduce((a, b) => a + b, 0);

  const signals: SignalBreakdown[] = rawSignals.map(({ key, raw, score, label }) => ({
    signal: key,
    rawValue: raw,
    normalizedScore: score,
    weight: NUDGE_WEIGHTS[key],
    contribution: score * NUDGE_WEIGHTS[key],
    label,
  }));

  const weightedSum = signals.reduce((sum, s) => sum + s.contribution, 0);
  const totalScore = Math.round((weightedSum / totalWeight) * 100);

  return { fanId: input.fanId, totalScore, signals, isEligible: true };
}

export function scoreSupporterFan(input: FanScoringInput): ScoreBreakdown {
  if (!input.hasPaidEvent || input.paidEventCount === 0) {
    return {
      fanId: input.fanId,
      totalScore: 0,
      signals: [],
      isEligible: false,
      ineligibleReason: "No support events recorded",
    };
  }

  const now = Date.now();
  const daysSinceLastPaid =
    input.lastPaidEventTime
      ? (now - new Date(input.lastPaidEventTime).getTime()) / 86_400_000
      : 30;
  const weeksSinceFirstPaid =
    input.firstPaidEventTime
      ? (now - new Date(input.firstPaidEventTime).getTime()) / (86_400_000 * 7)
      : 0;
  const consistency =
    input.streamsAttended > 0
      ? input.streamsWithPaidEvents / input.streamsAttended
      : 0;

  const rawSignals: Array<{
    key: SupporterSignalKey;
    raw: number;
    score: number;
    label: string;
  }> = [
    {
      key: "supportEventCount",
      raw: input.paidEventCount,
      score: clamp01(input.paidEventCount / CAPS.supportEventCount),
      label: `${input.paidEventCount} support event${input.paidEventCount === 1 ? "" : "s"}`,
    },
    {
      key: "supportRecency",
      raw: daysSinceLastPaid,
      score: clamp01(1 - daysSinceLastPaid / CAPS.supportRecencyDays),
      label:
        daysSinceLastPaid < 1
          ? "supported today"
          : `last supported ${Math.floor(daysSinceLastPaid)} day${Math.floor(daysSinceLastPaid) === 1 ? "" : "s"} ago`,
    },
    {
      key: "supportConsistency",
      raw: consistency,
      score: clamp01(consistency),
      label: `supports in ${input.streamsWithPaidEvents} of ${input.streamsAttended} stream${input.streamsAttended === 1 ? "" : "s"}`,
    },
    {
      key: "supportDuration",
      raw: weeksSinceFirstPaid,
      score: clamp01(weeksSinceFirstPaid / CAPS.supportDurationWeeks),
      label: `supporter for ${Math.floor(weeksSinceFirstPaid)} week${Math.floor(weeksSinceFirstPaid) === 1 ? "" : "s"}`,
    },
  ];

  const totalWeight = Object.values(SUPPORTER_WEIGHTS).reduce((a, b) => a + b, 0);

  const signals: SignalBreakdown[] = rawSignals.map(({ key, raw, score, label }) => ({
    signal: key,
    rawValue: raw,
    normalizedScore: score,
    weight: SUPPORTER_WEIGHTS[key],
    contribution: score * SUPPORTER_WEIGHTS[key],
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
    paidEventCount: number;
    videosWithPaidEvents: Set<string>;
    firstPaidEventTime: string | null;
    lastPaidEventTime: string | null;
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
      paidEventCount: 0,
      videosWithPaidEvents: new Set<string>(),
      firstPaidEventTime: null,
      lastPaidEventTime: null,
    };

    entry.videos.add(msg.yt_video_id);
    entry.totalMessages += 1;
    if (msg.time < entry.earliestTime) entry.earliestTime = msg.time;
    if (msg.time > entry.latestTime) entry.latestTime = msg.time;
    if (msg.text && isDirectAddress(msg.text)) entry.directAddressCount += 1;

    if (msg.paid_event_type !== null) {
      entry.hasPaidEvent = true;
      entry.paidEventCount += 1;
      entry.videosWithPaidEvents.add(msg.yt_video_id);
      if (entry.firstPaidEventTime === null || msg.time < entry.firstPaidEventTime) {
        entry.firstPaidEventTime = msg.time;
      }
      if (entry.lastPaidEventTime === null || msg.time > entry.lastPaidEventTime) {
        entry.lastPaidEventTime = msg.time;
      }
    }

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
        paidEventCount: 0,
        streamsWithPaidEvents: 0,
        lastPaidEventTime: null,
        firstPaidEventTime: null,
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
      paidEventCount: data.paidEventCount,
      streamsWithPaidEvents: data.videosWithPaidEvents.size,
      lastPaidEventTime: data.lastPaidEventTime,
      firstPaidEventTime: data.firstPaidEventTime,
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
