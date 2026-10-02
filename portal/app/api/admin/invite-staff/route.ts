import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInviteRedirectUrl } from "@/lib/portal-url";
import { writeAuditLog } from "@/lib/audit";
import { isAdmin as isAdminRole, isTeamRole } from "@/lib/security/roles";

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

    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const redirectTo = getInviteRedirectUrl(request);

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: body.full_name ?? null,
      },
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user) {
      // The sign-up trigger creates every account as a client; the staff role is
      // assigned here, server-side, after the admin check above.
      const { error: profileError } = await admin
        .from("profiles")
        .update({
          role: teamRole,
          full_name: body.full_name ?? null,
        })
        .eq("id", data.user.id);

      if (profileError) {
        console.error("Staff invite role assignment failed:", profileError.message);
        await admin.auth.admin.deleteUser(data.user.id);
        return NextResponse.json(
          { error: "Could not assign the team role. The invite was cancelled." },
          { status: 500 }
        );
      }

      await writeAuditLog(admin, {
        actorId: user.id,
        actorRole: "admin",
        action: "staff.invited",
        table: "profiles",
        recordId: data.user.id,
        details: { email, role: teamRole },
      });
    }

    return NextResponse.json({ success: true, userId: data.user?.id });
  } catch (err) {
    console.error("Staff invite failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to send invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
