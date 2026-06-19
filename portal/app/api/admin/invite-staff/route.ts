import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteRedirectUrl } from "@/lib/portal-url";

export async function POST(request: Request) {
  try {
    // Verify caller is an authenticated admin
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse payload
    let body: {
      email?: string;
      full_name?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const redirectTo = getInviteRedirectUrl(request);

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        role: "staff",
        full_name: body.full_name ?? null,
      },
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({
          full_name: body.full_name ?? null,
        })
        .eq("id", data.user.id);

      if (profileError) {
        console.error("Staff invite profile update failed:", profileError);
      }
    }

    return NextResponse.json({ success: true, userId: data.user?.id });
  } catch (err) {
    console.error("Staff invite failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to send invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
