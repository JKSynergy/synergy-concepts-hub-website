import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const error = searchParams.get("error_description") || searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // Invited users and password resets must choose a password before dashboard access.
  if (type === "invite" || type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/set-password`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Invited accounts may not include ?type=invite; fall back to invited_at.
  if (user?.invited_at) {
    return NextResponse.redirect(`${origin}/auth/set-password`);
  }

  let target = "/client";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = profile?.role ?? "client";
    target = role === "admin" || role === "staff" ? "/admin" : "/client";
  }

  return NextResponse.redirect(`${origin}${target}`);
}
