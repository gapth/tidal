import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildScoringInputs, scoreFan, scoreSupporterFan } from "@/lib/scoring";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();

  const [{ data: fans, error: fansError }, { data: messages, error: messagesError }] =
    await Promise.all([
      supabase.from("fans").select("id, owner_user_id"),
      supabase
        .from("messages")
        .select("fan_id, yt_video_id, time, text, paid_event_type, owner_user_id"),
    ]);

  if (fansError) {
    return NextResponse.json({ error: fansError.message }, { status: 500 });
  }
  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const fansByOwner = new Map<string, { id: string; owner_user_id: string }[]>();
  for (const fan of fans ?? []) {
    const list = fansByOwner.get(fan.owner_user_id) ?? [];
    list.push(fan);
    fansByOwner.set(fan.owner_user_id, list);
  }

  const messagesByOwner = new Map<
    string,
    {
      fan_id: string;
      yt_video_id: string;
      time: string;
      text: string | null;
      paid_event_type: string | null;
    }[]
  >();
  for (const msg of messages ?? []) {
    const list = messagesByOwner.get(msg.owner_user_id) ?? [];
    list.push(msg);
    messagesByOwner.set(msg.owner_user_id, list);
  }

  let totalFansScored = 0;

  for (const [ownerId, ownerFans] of fansByOwner) {
    const ownerMessages = messagesByOwner.get(ownerId) ?? [];
    const inputs = buildScoringInputs(ownerFans, ownerMessages);

    // Delete stale scores before recomputing so fans that transition types are clean.
    await supabase.from("fan_scores").delete().eq("owner_user_id", ownerId);

    const insertRows: {
      owner_user_id: string;
      fan_id: string;
      score: number;
      breakdown: unknown;
      computed_at: string;
      score_type: string;
    }[] = [];

    const computedAt = new Date().toISOString();

    for (const input of inputs) {
      if (input.hasPaidEvent) {
        const breakdown = scoreSupporterFan(input);
        if (!breakdown.isEligible) continue;
        insertRows.push({
          owner_user_id: ownerId,
          fan_id: input.fanId,
          score: breakdown.totalScore,
          breakdown,
          computed_at: computedAt,
          score_type: "supporter",
        });
      } else {
        const breakdown = scoreFan(input);
        if (!breakdown.isEligible) continue;
        insertRows.push({
          owner_user_id: ownerId,
          fan_id: input.fanId,
          score: breakdown.totalScore,
          breakdown,
          computed_at: computedAt,
          score_type: "nudge",
        });
      }
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("fan_scores")
        .insert(insertRows);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    totalFansScored += insertRows.length;
  }

  return NextResponse.json({
    usersScored: fansByOwner.size,
    fansScored: totalFansScored,
    durationMs: Date.now() - startedAt,
  });
}
