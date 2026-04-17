import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
      .from("fans")
      .select("id", { count: "exact", head: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ totalFans: count ?? 0 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected fans count error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
