import { describe, it, expect } from "vitest";
import { formatTimestamp, parsePageNumber, normalizeInterval } from "@/lib/utils";

describe("formatTimestamp", () => {
  it("returns placeholder for null", () => {
    expect(formatTimestamp(null)).toBe("No messages yet");
  });

  it("formats a valid ISO timestamp", () => {
    const result = formatTimestamp("2024-06-15T14:30:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("No messages yet");
  });
});

describe("parsePageNumber", () => {
  it("returns 1 for undefined", () => {
    expect(parsePageNumber(undefined)).toBe(1);
  });

  it("returns the parsed integer for a valid string", () => {
    expect(parsePageNumber("3")).toBe(3);
  });

  it("returns 1 for zero", () => {
    expect(parsePageNumber("0")).toBe(1);
  });

  it("returns 1 for negative numbers", () => {
    expect(parsePageNumber("-5")).toBe(1);
  });

  it("returns 1 for non-numeric strings", () => {
    expect(parsePageNumber("abc")).toBe(1);
  });

  it("returns 1 for empty string", () => {
    expect(parsePageNumber("")).toBe(1);
  });

  it("returns 1 for float strings by truncating", () => {
    expect(parsePageNumber("2.9")).toBe(2);
  });
});

describe("normalizeInterval", () => {
  it("returns current for empty input", () => {
    expect(normalizeInterval("", 30)).toBe(30);
  });

  it("returns current for whitespace-only input", () => {
    expect(normalizeInterval("   ", 30)).toBe(30);
  });

  it("returns current for non-numeric input", () => {
    expect(normalizeInterval("abc", 30)).toBe(30);
  });

  it("returns the rounded value for a valid number", () => {
    expect(normalizeInterval("45", 30)).toBe(45);
  });

  it("rounds fractional seconds", () => {
    expect(normalizeInterval("5.7", 30)).toBe(6);
  });

  it("clamps to minimum of 1", () => {
    expect(normalizeInterval("0", 30)).toBe(1);
    expect(normalizeInterval("-10", 30)).toBe(1);
  });
});
