import { NextResponse } from "next/server";
import { getInviteRedirectUrl } from "@/lib/portal-url";
import { requireStaffApi } from "@/lib/api/require-staff";
import { getClientOrError } from "../get-client";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if ("error" in auth && auth.error) return auth.error;

  const { id } = await context.params;
  const result = await getClientOrError(id);
  if ("error" in result && result.error) return result.error;

  const { client, admin } = result;
  const redirectTo = getInviteRedirectUrl(request);
  const email = client!.email;

  try {
    const { data: authData, error: authLookupError } =
      await admin!.auth.admin.getUserById(id);

    if (authLookupError || !authData.user) {
      return NextResponse.json({ error: "Auth account not found" }, { status: 404 });
    }

    const authUser = authData.user;
    const hasSignedIn = !!authUser.last_sign_in_at;
    const wasInvited = !!authUser.invited_at;

    // Never logged in and was originally invited — resend the invite email.
    if (!hasSignedIn && wasInvited) {
      const { error } = await admin!.auth.admin.inviteUserByEmail(email, {
        data: {
          role: "client",
          full_name: client!.full_name,
          company_name: client!.company_name,
          phone: client!.phone,
        },
        redirectTo,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        method: "invite",
        message: `Invitation email resent to ${email}`,
      });
    }

    // Add-client accounts or users who need a fresh setup link — send password reset.
    const { error: resetError } = await admin!.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectTo}?type=recovery`,
    });

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      method: "recovery",
      message: `Password setup link sent to ${email}`,
    });
  } catch (err) {
    console.error("Resend invite failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to resend invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
