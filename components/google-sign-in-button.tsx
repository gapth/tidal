"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  POST_LOGIN_COOKIE_NAME,
  POST_LOGIN_COOKIE_MAX_AGE,
} from "@/lib/browser-utils";

type GoogleSignInButtonProps = {
  next?: string;
};

export function GoogleSignInButton({ next = "/" }: GoogleSignInButtonProps) {
  const handleSignIn = async () => {
    const supabase = createSupabaseBrowserClient();
    document.cookie = `${POST_LOGIN_COOKIE_NAME}=${encodeURIComponent(next)}; Path=/; Max-Age=${POST_LOGIN_COOKIE_MAX_AGE}; SameSite=Lax`;
    const redirectTo = new URL("/auth/callback", window.location.origin);

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
      },
    });
  };

  return (
    <button
      className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
      onClick={handleSignIn}
      type="button"
    >
      Continue With Google
    </button>
  );
}
