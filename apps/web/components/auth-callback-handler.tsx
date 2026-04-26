"use client";

import {
  clearPostLoginNextCookie,
  getSafeNextPath,
  readPostLoginNextCookie,
} from "@/lib/auth-flow";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
      const nextFromCookie = readPostLoginNextCookie();
      const safeNext = getSafeNextPath(next ?? nextFromCookie);

      if (!code) {
        router.replace("/login");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      clearPostLoginNextCookie();

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
