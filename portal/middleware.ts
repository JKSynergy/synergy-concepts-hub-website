import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    console.error("Unhandled middleware error:", error instanceof Error ? error.message : "unknown error");
    // Fail closed for protected areas; public pages stay reachable.
    const path = request.nextUrl.pathname;
    if (path.startsWith("/admin") || path.startsWith("/client")) {
      return NextResponse.redirect(new URL("/login?error=unavailable", request.url));
    }
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
