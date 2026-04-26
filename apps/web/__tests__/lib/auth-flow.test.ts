import { describe, expect, it } from "vitest";

import { getSafeNextPath } from "@/lib/auth-flow";

describe("getSafeNextPath", () => {
  it("keeps valid app-relative paths", () => {
    expect(getSafeNextPath("/sessions/123")).toBe("/sessions/123");
  });

  it("falls back to home for missing or external paths", () => {
    expect(getSafeNextPath(undefined)).toBe("/");
    expect(getSafeNextPath("https://example.com")).toBe("/");
    expect(getSafeNextPath("sessions/123")).toBe("/");
  });
});
