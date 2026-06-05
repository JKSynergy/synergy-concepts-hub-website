import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // Verify caller is an authenticated admin/staff
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

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse payload
  let body: {
    email?: string;
    full_name?: string;
    company_name?: string;
    phone?: string;
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

  // Send invite via service-role client
  const admin = createAdminClient();
  const redirectTo = `${new URL(request.url).origin}/login`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      role: "client",
      full_name: body.full_name ?? null,
      company_name: body.company_name ?? null,
      phone: body.phone ?? null,
    },
    redirectTo,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update the profile row (created by the auth trigger) with extra details
  if (data.user) {
    await admin
      .from("profiles")
      .update({
        full_name: body.full_name ?? null,
        company_name: body.company_name ?? null,
        phone: body.phone ?? null,
      })
      .eq("id", data.user.id);
  }

  return NextResponse.json({ success: true, userId: data.user?.id });
}
