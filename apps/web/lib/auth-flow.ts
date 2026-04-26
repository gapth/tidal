const POST_LOGIN_COOKIE_NAME = "post_login_next";
const POST_LOGIN_COOKIE_MAX_AGE = 300;

export function getSafeNextPath(next: string | null | undefined): string {
  return next?.startsWith("/") ? next : "/";
}

export function readPostLoginNextCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${POST_LOGIN_COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function writePostLoginNextCookie(next: string): void {
  document.cookie = `${POST_LOGIN_COOKIE_NAME}=${encodeURIComponent(next)}; Path=/; Max-Age=${POST_LOGIN_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearPostLoginNextCookie(): void {
  document.cookie = `${POST_LOGIN_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
