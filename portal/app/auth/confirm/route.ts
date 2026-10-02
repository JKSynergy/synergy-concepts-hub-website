import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const error = searchParams.get("error_description") || searchParams.get("error");

  if (error) {
    // Never reflect provider/attacker-controlled text into the login page.
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (verifyError) {
    console.error("auth link failed:", verifyError.status ?? "unknown");
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  if (type === "invite" || type === "recovery" || type === "signup") {
    return NextResponse.redirect(`${origin}/auth/set-password`);
  }

  return NextResponse.redirect(`${origin}/client`);
}
