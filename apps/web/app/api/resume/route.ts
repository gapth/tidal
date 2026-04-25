import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { session_id?: string };
  const { session_id } = body;

  if (!session_id) {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: session, error } = await supabase
    .from("sessions")
    .select("video_id")
    .eq("id", session_id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
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
      body: JSON.stringify({ video_id: session.video_id, session_id }),
    });
    if (!workerRes.ok) {
      const text = await workerRes.text().catch(() => "");
      console.error("Worker resume returned", workerRes.status, text);
      return NextResponse.json(
        { error: "Worker failed to resume" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("Failed to contact worker for resume:", err);
    return NextResponse.json({ error: "Worker unreachable" }, { status: 502 });
  }

  return NextResponse.json({ status: "resumed" });
}
