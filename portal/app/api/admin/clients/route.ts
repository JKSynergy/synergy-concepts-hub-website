import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/security/temp-password";
import { isOperationalStaff } from "@/lib/security/roles";

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

  if (!profile || !isOperationalStaff(profile.role)) {
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

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const fullName = body.full_name?.trim() || null;
  const companyName = body.company_name?.trim() || null;
  const phone = body.phone?.trim() || null;

  // Create the auth user directly with a temporary password
  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      company_name: companyName,
      phone,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update the profile row (created by the auth trigger) with extra details
  if (data.user) {
    await admin
      .from("profiles")
      .update({
        role: "client",
        full_name: fullName,
        company_name: companyName,
        phone,
      })
      .eq("id", data.user.id);
  }

  return NextResponse.json({
    success: true,
    userId: data.user?.id,
    email,
    tempPassword,
  });
}
