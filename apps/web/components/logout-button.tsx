"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRef } from "react";

export function LogoutButton({ className }: { className?: string }) {
  const supabase = useRef(createSupabaseBrowserClient());
  const router = useRouter();

  async function handleLogout() {
    await supabase.current.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className={className ?? "text-sm text-gray-400 hover:text-gray-600"}
    >
      Log out
    </button>
  );
}
