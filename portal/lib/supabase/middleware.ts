import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { adminRouteRedirect, isAdmin, isFinance, landingFor } from "@/lib/security/roles";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdminRoute = path.startsWith("/admin");
  const isClientRoute = path.startsWith("/client");
  const isProtected = isAdminRoute || isClientRoute;

  // Protected pages fail CLOSED: if we cannot verify the session, nobody gets in.
  // (Row-level security protects the data either way; this protects the pages.)
  const unavailable = () =>
    isProtected
      ? NextResponse.redirect(new URL("/login?error=unavailable", request.url))
      : NextResponse.next({ request });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error(
        "Missing Supabase environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your Vercel project settings."
      );
      return unavailable();
    }

    let supabaseResponse = NextResponse.next({
      request,
    });

    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh session if expired
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // A signed-in, active user who opens /login goes straight to their area.
    if (path === "/login" && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, archived_at")
        .eq("id", user.id)
        .single();
      if (profile && !profile.archived_at) {
        return NextResponse.redirect(new URL(landingFor(profile.role), request.url));
      }
      return supabaseResponse;
    }

    if (isProtected) {
      if (!user) {
        return NextResponse.redirect(new URL("/login", request.url));
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, archived_at")
        .eq("id", user.id)
        .single();

      // Archived accounts keep no access (their sign-in is also blocked in Supabase Auth).
      if (profile?.archived_at) {
        return NextResponse.redirect(new URL("/login?error=account_disabled", request.url));
      }

      const role = profile?.role ?? "client";

      if (isAdminRoute) {
        // Single role-based route policy (lib/security/roles.ts): staff never reach
        // finance/academy/team; finance only reaches finance, clients and projects.
        const target = adminRouteRedirect(role, path);
        if (target) return NextResponse.redirect(new URL(target, request.url));
      }

      if (isClientRoute && (isAdmin(role) || isFinance(role))) {
        return NextResponse.redirect(new URL(landingFor(role), request.url));
      }
    }

    return supabaseResponse;
  } catch (error) {
    console.error("Middleware error:", error instanceof Error ? error.message : "unknown error");
    return unavailable();
  }
}
