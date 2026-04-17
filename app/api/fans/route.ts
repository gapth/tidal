import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
      .from("fans")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ totalFans: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unexpected fans count error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
