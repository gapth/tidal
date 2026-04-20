import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildScoringInputs, scoreFan } from "@/lib/scoring";

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

  // Group fans and messages by owner so scoring runs per-user.
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

  const upsertRows: {
    owner_user_id: string;
    fan_id: string;
    score: number;
    breakdown: unknown;
    computed_at: string;
  }[] = [];

  for (const [ownerId, ownerFans] of fansByOwner) {
    const ownerMessages = messagesByOwner.get(ownerId) ?? [];
    const inputs = buildScoringInputs(ownerFans, ownerMessages);

    for (const input of inputs) {
      const breakdown = scoreFan(input);
      if (!breakdown.isEligible) continue;
      upsertRows.push({
        owner_user_id: ownerId,
        fan_id: input.fanId,
        score: breakdown.totalScore,
        breakdown,
        computed_at: new Date().toISOString(),
      });
    }
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("fan_scores")
      .upsert(upsertRows, { onConflict: "owner_user_id,fan_id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    usersScored: fansByOwner.size,
    fansScored: upsertRows.length,
    durationMs: Date.now() - startedAt,
  });
}
