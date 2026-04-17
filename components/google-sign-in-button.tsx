"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type GoogleSignInButtonProps = {
  next?: string;
};

export function GoogleSignInButton({ next = "/" }: GoogleSignInButtonProps) {
  const handleSignIn = async () => {
    const supabase = createSupabaseBrowserClient();
    document.cookie = `tidal-post-login-path=${encodeURIComponent(next)}; Path=/; Max-Age=600; SameSite=Lax`;
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
