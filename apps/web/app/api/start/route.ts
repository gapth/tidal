import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseYouTubeVideoId } from "@/lib/youtube";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { youtubeUrl?: string };
  const { youtubeUrl } = body;

  if (!youtubeUrl) {
    return NextResponse.json(
      { error: "youtubeUrl is required" },
      { status: 400 },
    );
  }

  const videoId = parseYouTubeVideoId(youtubeUrl);
  if (!videoId) {
    return NextResponse.json(
      { error: "Could not parse a video ID from the URL" },
      { status: 400 },
    );
  }

  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: session, error: dbError } = await supabase
    .from("sessions")
    .insert({
      video_id: videoId,
      youtube_url: youtubeUrl,
      owner_user_id: user.id,
    })
    .select("id")
    .single();

  if (dbError || !session) {
    console.error("Failed to create session:", dbError);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }

  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    return NextResponse.json(
      { error: "WORKER_URL not configured" },
      { status: 500 },
    );
  }

  try {
    const workerRes = await fetch(`${workerUrl}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, session_id: session.id }),
    });
    if (!workerRes.ok) {
      console.error("Worker returned", workerRes.status);
    }
  } catch (err) {
    console.error("Failed to contact worker:", err);
    // Don't fail the request — session is created, worker can be retried
  }

  return NextResponse.json({ session_id: session.id });
}
