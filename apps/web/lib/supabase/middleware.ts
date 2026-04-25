import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isAuthRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname === "/denied"
  );
}

function isAllowed(email: string | undefined): boolean {
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes((email ?? "").toLowerCase());
}

function buildLoginRedirect(
  request: NextRequest,
  pathname: string,
): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

function buildHomeRedirect(request: NextRequest): NextResponse {
  const homeUrl = request.nextUrl.clone();
  homeUrl.pathname = "/";
  homeUrl.search = "";
  return NextResponse.redirect(homeUrl);
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && !isAuthRoute(pathname)) {
    return buildLoginRedirect(request, pathname);
  }

  if (user && pathname === "/login") {
    return buildHomeRedirect(request);
  }

  if (user && !isAuthRoute(pathname) && !isAllowed(user.email)) {
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = "/denied";
    return NextResponse.redirect(deniedUrl);
  }

  return response;
}
