import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Generate a readable temporary password (12 chars, mixed case + digits + symbol)
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;

  const pick = (set: string) =>
    set[Math.floor(Math.random() * set.length)];

  let pwd =
    pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  for (let i = 0; i < 8; i++) pwd += pick(all);

  // Shuffle
  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

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
      role: "client",
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
