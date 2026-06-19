import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remove a client account and all related portal data.
 * Cleans up public tables and storage before deleting the auth user,
 * which avoids "Database error deleting user" FK violations.
 */
export async function deleteClientAccount(
  admin: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  await purgeUserStorage(admin, id);

  await admin.from("bookings").update({ client_id: null }).eq("client_id", id);
  await admin.from("leads").update({ converted_client_id: null }).eq("converted_client_id", id);
  await admin.from("payments").update({ recorded_by: null }).eq("recorded_by", id);
  await admin.from("audit_logs").delete().eq("actor_id", id);
  await admin.from("project_updates").delete().eq("author_id", id);
  await admin.from("project_assignments").delete().eq("staff_id", id);
  await admin.from("invoices").delete().eq("client_id", id);
  await admin.from("projects").delete().eq("client_id", id);

  const { error } = await admin.auth.admin.deleteUser(id);

  if (error?.message?.toLowerCase().includes("database error deleting user")) {
    return {
      error:
        "Could not delete this account because linked records still exist in the database. Run migration 007 in Supabase SQL Editor, or check Dashboard → Logs → Postgres logs for the exact constraint.",
    };
  }

  return { error: error?.message ?? null };
}

async function purgeUserStorage(admin: SupabaseClient, userId: string) {
  const { error: rpcError } = await admin.rpc("purge_user_storage", {
    target_id: userId,
  });
  if (!rpcError) return;

  for (const bucket of ["deliverables", "receipts"]) {
    const { data: files } = await admin.storage.from(bucket).list(userId, {
      limit: 1000,
    });
    if (!files?.length) continue;
    const paths = files.map((f) => `${userId}/${f.name}`);
    await admin.storage.from(bucket).remove(paths);
  }
}
