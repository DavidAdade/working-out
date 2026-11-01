import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkUser } from "./user";

// Token routes (calendar feed, Apple Health) check their own key instead of a session
const PUBLIC_PATHS = ["/login", "/auth", "/cal/", "/api/health"];

/** Refreshes the session cookie on every request and sends signed-out visitors to /login (and signed-in ones away from it). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    // Stays signed in for 400 days (the library default); HTTPS-only once deployed
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { user, transient } = await checkUser(supabase);
  // Supabase or the network hiccuped: that isn't signing out. Let the page or action deal with it (it fails softly).
  if (transient) return response;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (!user && !isPublic) return redirectTo(request, "/login", response);
  // Still signed in: /login has nothing to do, so go back to the app
  if (user && path === "/login") return redirectTo(request, "/", response);
  return response;
}

/** A redirect that keeps any session cookies refreshed on the way, so a fresh token is never dropped. */
function redirectTo(request: NextRequest, pathname: string, from: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const res = NextResponse.redirect(url);
  for (const c of from.cookies.getAll()) res.cookies.set(c);
  return res;
}
