import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";

// Clients are never hard-deleted while they have project or financial history.
// The default lifecycle is ARCHIVE: the account can no longer sign in, but
// invoices, payments, receipts, projects and the audit trail are preserved.
// (Migration 010 also makes the database refuse the cascade.)

const BAN_FOREVER = "876000h"; // ~100 years; Supabase auth ban duration

export async function archiveClientAccount(
  admin: SupabaseClient,
  clientId: string,
  actorId: string
): Promise<{ error: string | null }> {
  const { error: profileError } = await admin
    .from("profiles")
    .update({ archived_at: new Date().toISOString(), archived_by: actorId })
    .eq("id", clientId)
    .eq("role", "client")
    .is("archived_at", null);
  if (profileError) return { error: profileError.message };

  // Block sign-in. If this fails the account is still marked archived, and the
  // middleware refuses archived accounts, so report it rather than hiding it.
  const { error: banError } = await admin.auth.admin.updateUserById(clientId, {
    ban_duration: BAN_FOREVER,
  });

  await writeAuditLog(admin, {
    actorId,
    actorRole: "admin",
    action: "client.archived",
    table: "profiles",
    recordId: clientId,
    details: { sign_in_blocked: !banError },
  });

  return { error: banError ? `Archived, but sign-in could not be blocked: ${banError.message}` : null };
}

export async function restoreClientAccount(
  admin: SupabaseClient,
  clientId: string,
  actorId: string
): Promise<{ error: string | null }> {
  const { error: banError } = await admin.auth.admin.updateUserById(clientId, { ban_duration: "none" });
  if (banError) return { error: banError.message };

  const { error } = await admin
    .from("profiles")
    .update({ archived_at: null, archived_by: null })
    .eq("id", clientId)
    .eq("role", "client");
  if (error) return { error: error.message };

  await writeAuditLog(admin, {
    actorId,
    actorRole: "admin",
    action: "client.restored",
    table: "profiles",
    recordId: clientId,
  });
  return { error: null };
}

/**
 * Permanent removal, only for an account with NO invoices and NO projects
 * (for example one created by mistake). Anything with history must be archived.
 */
export async function deleteClientWithoutHistory(
  admin: SupabaseClient,
  clientId: string,
  actorId: string
): Promise<{ error: string | null; hasHistory?: boolean }> {
  const [{ count: invoices }, { count: projects }] = await Promise.all([
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    admin.from("projects").select("id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);
  if ((invoices ?? 0) > 0 || (projects ?? 0) > 0) {
    return {
      hasHistory: true,
      error: "This client has project or invoice history and cannot be deleted. Archive the account instead.",
    };
  }

  await purgeUserStorage(admin, clientId);
  await admin.from("bookings").update({ client_id: null }).eq("client_id", clientId);
  await admin.from("leads").update({ converted_client_id: null }).eq("converted_client_id", clientId);

  await writeAuditLog(admin, {
    actorId,
    actorRole: "admin",
    action: "client.deleted_without_history",
    table: "profiles",
    recordId: clientId,
  });

  const { error } = await admin.auth.admin.deleteUser(clientId);
  return { error: error?.message ?? null };
}

async function purgeUserStorage(admin: SupabaseClient, userId: string) {
  const { error: rpcError } = await admin.rpc("purge_user_storage", { target_id: userId });
  if (!rpcError) return;

  for (const bucket of ["deliverables", "receipts"]) {
    const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    if (!files?.length) continue;
    await admin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
  }
}
