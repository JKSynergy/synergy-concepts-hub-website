import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Protect routes by role
  const path = request.nextUrl.pathname;

  const isAdminRoute = path.startsWith("/admin");
  const isClientRoute = path.startsWith("/client");

  if (isAdminRoute || isClientRoute) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "client";

    if (isAdminRoute && role !== "admin" && role !== "staff") {
      return NextResponse.redirect(new URL("/client", request.url));
    }

    // Staff cannot access finance or admin-only reports
    const isAdminOnlyRoute =
      isAdminRoute &&
      (path.startsWith("/admin/invoices") ||
        path.startsWith("/admin/reports") ||
        path.startsWith("/admin/academy"));

    if (isAdminOnlyRoute && role !== "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    if (isClientRoute && role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return supabaseResponse;
}
