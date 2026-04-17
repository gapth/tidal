export const POST_LOGIN_COOKIE_NAME = "tidal-post-login-path";
// 10 minutes — expires if the user takes longer than this to complete OAuth
export const POST_LOGIN_COOKIE_MAX_AGE = 600;

// Accepts only same-origin paths (must start with / but not //) to prevent open redirects.
export function getSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

export function getCookieValue(name: string): string | null {
  const prefix = `${name}=`;
  for (const cookie of document.cookie.split("; ")) {
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }
  return null;
}

export function clearCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}
