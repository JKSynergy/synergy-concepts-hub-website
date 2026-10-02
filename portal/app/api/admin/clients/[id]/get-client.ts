import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClient } from "@/lib/security/roles";

export async function getClientOrError(id: string) {
  const admin = createAdminClient();
  const { data: client, error } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, company_name, phone, billing_address, tax_id, external_portal_url, role, created_at, updated_at"
    )
    .eq("id", id)
    .single();

  if (error || !client) {
    return { error: NextResponse.json({ error: "Client not found" }, { status: 404 }) };
  }

  if (!isClient(client.role)) {
    return { error: NextResponse.json({ error: "Not a client account" }, { status: 400 }) };
  }

  return { client, admin };
}
