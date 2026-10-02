import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/security/temp-password";
import { writeAuditLog } from "@/lib/audit";
import { isAdmin as isAdminRole, isTeamRole } from "@/lib/security/roles";

export async function POST(request: Request) {
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

  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse payload
  let body: {
    email?: string;
    full_name?: string;
    role?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only "staff" and "finance" can be assigned here. Admin and client are never accepted.
  const requestedRole = body.role ?? "staff";
  if (!isTeamRole(requestedRole)) {
    return NextResponse.json({ error: "Role must be staff or finance" }, { status: 400 });
  }
  const teamRole = requestedRole;

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const fullName = body.full_name?.trim() || null;

  // Create the auth user directly with a temporary password
  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // The sign-up trigger always creates a client. Staff role is assigned here,
  // server-side with the service role, after the admin check above.
  if (data.user) {
    const { error: roleError } = await admin
      .from("profiles")
      .update({
        role: teamRole,
        full_name: fullName,
      })
      .eq("id", data.user.id);

    if (roleError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: "Could not assign the team role. Nothing was created." }, { status: 500 });
    }

    await writeAuditLog(admin, {
      actorId: user.id,
      actorRole: "admin",
      action: "staff.created",
      table: "profiles",
      recordId: data.user.id,
      details: { email, role: teamRole },
    });
  }

  return NextResponse.json({
    success: true,
    userId: data.user?.id,
    email,
    tempPassword,
  });
}
