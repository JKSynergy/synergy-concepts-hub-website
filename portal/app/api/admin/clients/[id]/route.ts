import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/api/require-staff";
import { getClientOrError } from "./get-client";
import {
  archiveClientAccount,
  deleteClientWithoutHistory,
  restoreClientAccount,
} from "@/lib/admin/client-lifecycle";
import { isAdmin } from "@/lib/security/roles";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if ("error" in auth && auth.error) return auth.error;

  const { id } = await context.params;
  const result = await getClientOrError(id);
  if ("error" in result && result.error) return result.error;

  return NextResponse.json({ client: result.client });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if ("error" in auth && auth.error) return auth.error;

  const { id } = await context.params;
  const result = await getClientOrError(id);
  if ("error" in result && result.error) return result.error;

  let body: {
    email?: string;
    full_name?: string;
    company_name?: string;
    phone?: string;
    billing_address?: string;
    tax_id?: string;
    external_portal_url?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = result.admin!;
  const email = body.email?.trim().toLowerCase();

  const profileUpdate = {
    full_name: body.full_name?.trim() || null,
    company_name: body.company_name?.trim() || null,
    phone: body.phone?.trim() || null,
    billing_address: body.billing_address?.trim() || null,
    tax_id: body.tax_id?.trim() || null,
    external_portal_url: body.external_portal_url?.trim() || null,
    ...(email ? { email } : {}),
  };

  const { error: profileError } = await admin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (email && email !== result.client!.email) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      email,
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
  }

  const { data: client } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, company_name, phone, billing_address, tax_id, external_portal_url, created_at, updated_at"
    )
    .eq("id", id)
    .single();

  return NextResponse.json({ success: true, client });
}

// DELETE archives the client (sign-in blocked, history kept). Only an
// administrator may do this; staff cannot. `?permanent=1` removes an account
// only when it has no project or invoice history at all.
export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if ("error" in auth && auth.error) return auth.error;
  if (!isAdmin(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  if (id === auth.user!.id) {
    return NextResponse.json({ error: "You cannot archive your own account" }, { status: 400 });
  }

  const result = await getClientOrError(id);
  if ("error" in result && result.error) return result.error;

  const admin = result.admin!;
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";

  const outcome: { error: string | null; hasHistory?: boolean } = permanent
    ? await deleteClientWithoutHistory(admin, id, auth.user!.id)
    : await archiveClientAccount(admin, id, auth.user!.id);

  const { error, hasHistory } = outcome;

  if (error) {
    return NextResponse.json({ error }, { status: hasHistory ? 409 : 400 });
  }

  return NextResponse.json({ success: true, archived: !permanent });
}

// POST restores an archived client.
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if ("error" in auth && auth.error) return auth.error;
  if (!isAdmin(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await getClientOrError(id);
  if ("error" in result && result.error) return result.error;

  const { error } = await restoreClientAccount(result.admin!, id, auth.user!.id);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ success: true });
}
