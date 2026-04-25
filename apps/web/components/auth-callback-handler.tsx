"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const POST_LOGIN_COOKIE_NAME = "post_login_next";

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function getSafeNext(next: string | null | undefined): string {
  return next?.startsWith("/") ? next : "/";
}

type AuthCallbackHandlerProps = {
  code: string | null;
  next: string | null;
};

export function AuthCallbackHandler({ code, next }: AuthCallbackHandlerProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const exchangeCode = async () => {
      const nextFromCookie = getCookieValue(POST_LOGIN_COOKIE_NAME);
      const safeNext = getSafeNext(next ?? nextFromCookie);

      if (!code) {
        router.replace("/login");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      clearCookie(POST_LOGIN_COOKIE_NAME);

      if (cancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        router.replace(
          `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(safeNext)}`,
        );
        return;
      }

      router.replace(safeNext);
      router.refresh();
    };

    void exchangeCode();

    return () => {
      cancelled = true;
    };
  }, [code, next, router]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Tidal
            </p>
            <h1 className="text-3xl font-semibold text-white">
              Completing Sign-In
            </h1>
            <p className="max-w-2xl text-sm text-slate-400">
              Finalizing your Google session and returning you to the app.
            </p>
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
