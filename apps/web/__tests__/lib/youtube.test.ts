import { describe, expect, it } from "vitest";

import { parseYouTubeVideoId } from "@/lib/youtube";

describe("parseYouTubeVideoId", () => {
  it("parses standard watch URLs", () => {
    expect(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("parses youtu.be live URLs", () => {
    expect(parseYouTubeVideoId("https://youtu.be/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("accepts bare video ids", () => {
    expect(parseYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for invalid input", () => {
    expect(parseYouTubeVideoId("not-a-video!")).toBeNull();
  });
});
