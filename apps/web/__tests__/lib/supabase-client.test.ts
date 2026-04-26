import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(),
}));

import { createBrowserClient } from "@supabase/ssr";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

describe("createSupabaseBrowserClient", () => {
  beforeEach(() => {
    vi.mocked(createBrowserClient).mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  });

  it("disables automatic OAuth session detection in the URL", () => {
    createSupabaseBrowserClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-publishable-key",
      {
        auth: {
          detectSessionInUrl: false,
        },
      },
    );
  });
});
