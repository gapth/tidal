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

  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    return NextResponse.json(
      { error: "WORKER_URL not configured" },
      { status: 500 },
    );
  }

  try {
    const workerRes = await fetch(`${workerUrl}/api/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id }),
    });
    if (!workerRes.ok) {
      console.error("Worker stop returned", workerRes.status);
    }
  } catch (err) {
    console.error("Failed to contact worker for stop:", err);
  }

  return NextResponse.json({ status: "stopped" });
}
