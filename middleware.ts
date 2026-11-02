import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// The offline page, the service worker and the ping need no session (and must answer while Supabase is down)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|sw.js|sw-push.js|offline|api/ping|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
