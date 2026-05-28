import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getCoachView, VIEW_HOME, type CoachRole } from "@/lib/auth/roles";
import { getPublicSupabaseEnv } from "./env";

/** Routes reachable without an authenticated session. */
const PUBLIC_PATHS = ["/login"];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

/**
 * Runs on every matched request (see middleware.ts):
 *   1. Refreshes the Supabase auth session and syncs cookies.
 *   2. Gates routes: unauthenticated users are sent to /login.
 *   3. Role-routes authenticated users — Senior Head Coaches / admins to the
 *      admin view, everyone else to the read-only view — and keeps non-admins
 *      out of /admin.
 *
 * IMPORTANT: keep the supabaseResponse object intact. Do not create a new
 * NextResponse without copying its cookies, or the session will desync.
 */
export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request });

  const { url, publishableKey } = getPublicSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getUser — it refreshes the
  // session token and any intervening logic risks a desync / random logout.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirectTo = (destination: string) => {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = destination;
    redirectUrl.search = "";
    const response = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  if (!user) {
    if (isPublicPath(pathname)) return supabaseResponse;
    return redirectTo("/login");
  }

  // Authenticated: resolve the coach's view from title + is_admin.
  const { data: coach } = await supabase
    .from("coaches")
    .select("title, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle<CoachRole>();

  const view = getCoachView(coach ?? { title: null, is_admin: null });
  const home = VIEW_HOME[view];

  if (pathname === "/login" || pathname === "/") return redirectTo(home);

  // Read-only coaches may never reach the admin view.
  if (pathname.startsWith("/admin") && view !== "admin") {
    return redirectTo(home);
  }

  return supabaseResponse;
};
