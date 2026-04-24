import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DeniedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  async function signOut() {
    "use server";
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center px-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          Access restricted
        </h1>
        <p className="text-gray-600 mb-2">
          Tidal is currently limited to invited test users.
        </p>
        {user?.email && (
          <p className="text-sm text-gray-500 mb-6">
            Signed in as <span className="font-mono">{user.email}</span>
          </p>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-gray-500 underline hover:text-gray-700"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
