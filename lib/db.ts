import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedMessage } from "./youtube";

export async function upsertFansAndMessages(
  supabase: SupabaseClient,
  messages: NormalizedMessage[],
  videoId: string,
  userId: string,
): Promise<void> {
  // Deduplicate fans by YouTube channel ID — a fan may have sent multiple messages.
  const fansByYtId = new Map<
    string,
    { owner_user_id: string; yt_id: string; name: string | null }
  >();

  for (const message of messages) {
    fansByYtId.set(message.fanId, {
      owner_user_id: userId,
      yt_id: message.fanId,
      name: message.name,
    });
  }

  const { data: upsertedFans, error: fansError } = await supabase
    .from("fans")
    .upsert(Array.from(fansByYtId.values()), { onConflict: "owner_user_id,yt_id" })
    .select("id, yt_id");

  if (fansError) throw fansError;

  // Build a lookup from YouTube channel ID → database fan UUID for the message rows.
  const fanIdByYtId = new Map(
    (upsertedFans ?? []).map((fan) => [fan.yt_id as string, fan.id as string]),
  );

  const dbMessages = messages
    .map((message) => ({
      owner_user_id: userId,
      yt_id: message.ytId,
      yt_video_id: videoId,
      fan_id: fanIdByYtId.get(message.fanId),
      text: message.text,
      time: message.time,
      paid_event_type: message.paidEventType,
      paid_amount_micros: message.paidAmountMicros,
      paid_currency: message.paidCurrency,
    }))
    .filter((message) => message.fan_id);

  const { error: messagesError } = await supabase
    .from("messages")
    .upsert(dbMessages, { onConflict: "owner_user_id,yt_id" });

  if (messagesError) throw messagesError;
}
