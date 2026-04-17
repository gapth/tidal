// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getSafeNext,
  getCookieValue,
  clearCookie,
  POST_LOGIN_COOKIE_NAME,
  POST_LOGIN_COOKIE_MAX_AGE,
} from "@/lib/browser-utils";

describe("getSafeNext", () => {
  it("returns the path when it starts with /", () => {
    expect(getSafeNext("/dashboard")).toBe("/dashboard");
  });

  it("returns / for null", () => {
    expect(getSafeNext(null)).toBe("/");
  });

  it("returns / for empty string", () => {
    expect(getSafeNext("")).toBe("/");
  });

  it("rejects absolute URLs to prevent open redirect", () => {
    expect(getSafeNext("https://evil.com")).toBe("/");
  });

  it("rejects protocol-relative URLs (// prefix)", () => {
    // Browsers treat //evil.com as a protocol-relative URL pointing off-site.
    expect(getSafeNext("//evil.com")).toBe("/");
  });

  it("accepts nested paths", () => {
    expect(getSafeNext("/fans?page=2")).toBe("/fans?page=2");
  });
});

describe("getCookieValue", () => {
  beforeEach(() => {
    // Clear cookies between tests
    document.cookie.split("; ").forEach((cookie) => {
      const name = cookie.split("=")[0];
      document.cookie = `${name}=; Max-Age=0`;
    });
  });

  it("returns null when the cookie is not set", () => {
    expect(getCookieValue("nonexistent")).toBeNull();
  });

  it("returns the cookie value when set", () => {
    document.cookie = "test-cookie=hello";
    expect(getCookieValue("test-cookie")).toBe("hello");
  });

  it("URL-decodes the cookie value", () => {
    document.cookie = `test-path=${encodeURIComponent("/fans?page=2")}`;
    expect(getCookieValue("test-path")).toBe("/fans?page=2");
  });
});

describe("clearCookie", () => {
  it("writes a Max-Age=0 deletion directive for the named cookie", () => {
    const writes: string[] = [];

    // Walk the prototype chain to find where the cookie getter/setter lives.
    let cookieTarget: object = document;
    while (cookieTarget) {
      if (Object.getOwnPropertyDescriptor(cookieTarget, "cookie")) break;
      cookieTarget = Object.getPrototypeOf(cookieTarget);
    }
    const orig = Object.getOwnPropertyDescriptor(cookieTarget, "cookie")!;

    Object.defineProperty(cookieTarget, "cookie", {
      get: orig.get,
      set(value: string) {
        writes.push(value);
        orig.set?.call(this, value);
      },
      configurable: true,
    });

    clearCookie("my-session");

    Object.defineProperty(cookieTarget, "cookie", orig);
    expect(writes[0]).toContain("my-session=");
    expect(writes[0]).toMatch(/Max-Age=0/);
  });
});

describe("constants", () => {
  it("POST_LOGIN_COOKIE_NAME is the expected value", () => {
    expect(POST_LOGIN_COOKIE_NAME).toBe("tidal-post-login-path");
  });

  it("POST_LOGIN_COOKIE_MAX_AGE is 600 seconds (10 minutes)", () => {
    expect(POST_LOGIN_COOKIE_MAX_AGE).toBe(600);
  });
});
