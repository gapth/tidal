import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { BrandLink } from "@/components/brand-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    code?: string;
    error?: string;
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const resolvedSearchParams = await searchParams;
  const code = resolvedSearchParams.code;
  const error = resolvedSearchParams.error;
  const next = resolvedSearchParams.next?.startsWith("/")
    ? resolvedSearchParams.next
    : "/";

  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
  }

  if (user) {
    redirect(next);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50">
          <div className="space-y-3">
            <BrandLink />
            <h1 className="text-3xl font-semibold text-white">
              Sign In To Tidal
            </h1>
            <p className="max-w-2xl text-sm text-slate-400">
              Access to chat tracking is restricted to signed-in users. For now,
              sign in with Google only. No additional Google API access is
              requested in this login flow.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex min-h-72 flex-col items-start justify-center gap-5 rounded-3xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-8">
            {error ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
            <div>
              <h2 className="text-xl font-semibold text-white">
                Continue with your Google account
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                This uses Supabase Auth with Google OAuth and the standard login
                scopes only: profile, email, and openid.
              </p>
            </div>
            <GoogleSignInButton next={next} />
          </div>
        </section>
      </div>
    </main>
  );
}
