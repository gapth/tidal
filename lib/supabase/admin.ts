// FOR SCRIPTS AND ADMIN ROUTES ONLY — never import from app routes or components.
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase admin env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
