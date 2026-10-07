"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { isAdmin as checkIsAdmin, isOperationalStaff } from "@/lib/security/roles";

type ActionResult = { error?: string; success?: boolean; id?: string };

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isStaff: false, isAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isStaff = isOperationalStaff(profile?.role);
  const isAdmin = checkIsAdmin(profile?.role);
  return { supabase, user, isStaff, isAdmin };
}

export async function createSystem(formData: FormData): Promise<ActionResult> {
  const { supabase, isAdmin } = await getActor();
  if (!isAdmin) return { error: "Forbidden: Admin access required" };

  const clientId = formData.get("client_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const systemType = formData.get("system_type")?.toString() || "web_platform";
  const status = formData.get("status")?.toString() || "planned";
  const description = formData.get("description")?.toString().trim() || null;
  const primaryUrl = formData.get("primary_url")?.toString().trim() || null;
  const originProjectId = formData.get("origin_project_id")?.toString() || null;

  if (!clientId || !name) {
    return { error: "Client and System Name are required" };
  }

  const { data, error } = await supabase
    .from("systems")
    .insert({
      client_id: clientId,
      name,
      system_type: systemType,
      status,
      description,
      primary_url: primaryUrl,
      origin_project_id: originProjectId ? originProjectId : null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/systems");
  return { success: true, id: data.id };
}

const SYSTEM_TYPES = new Set([
  "web_platform",
  "mobile_app",
  "ecommerce",
  "sacco_platform",
  "lending_system",
  "corporate_website",
  "custom_api",
  "internal_tool",
  "other",
]);

const SYSTEM_STATUSES = new Set([
  "planned",
  "in_build",
  "live",
  "maintenance_only",
  "suspended",
  "retired",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edit a system's registry metadata (name, client, type, status, URL, scope).
 * Admin only. Intentionally cannot touch: the system id, status tokens,
 * suspension metadata, origin project, or any infrastructure/resource links —
 * those have dedicated guarded flows.
 */
export async function updateSystem(systemId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, user, isAdmin } = await getActor();
  if (!user || !isAdmin) return { error: "Forbidden: Admin access required" };

  if (!UUID_RE.test(systemId)) return { error: "Invalid system ID" };

  const clientId = formData.get("client_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const systemType = formData.get("system_type")?.toString() || "web_platform";
  const status = formData.get("status")?.toString() || "planned";
  const description = formData.get("description")?.toString().trim() || null;
  const primaryUrl = formData.get("primary_url")?.toString().trim() || null;

  if (!clientId || !name) {
    return { error: "Client and System Name are required" };
  }
  if (!UUID_RE.test(clientId)) return { error: "Invalid client" };
  if (!SYSTEM_TYPES.has(systemType)) return { error: "Invalid system type" };
  if (!SYSTEM_STATUSES.has(status)) return { error: "Invalid status" };
  if (primaryUrl) {
    try {
      new URL(primaryUrl);
    } catch {
      return { error: "Primary URL must be a valid URL" };
    }
  }

  const { data: previous } = await supabase
    .from("systems")
    .select("client_id, name, system_type, status, description, primary_url")
    .eq("id", systemId)
    .single();
  if (!previous) return { error: "System not found" };

  const next = {
    client_id: clientId,
    name,
    system_type: systemType,
    status,
    description,
    primary_url: primaryUrl,
  };

  const { error } = await supabase.from("systems").update(next).eq("id", systemId);
  if (error) return { error: error.message };

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    const before = (previous as Record<string, unknown>)[key];
    if (before !== next[key]) changed[key] = { from: before, to: next[key] };
  }

  const admin = createAdminClient();
  await writeAuditLog(admin, {
    actorId: user.id,
    actorRole: "admin",
    action: "system.updated",
    table: "systems",
    recordId: systemId,
    details: { fields: changed },
  });

  revalidatePath("/admin/systems");
  revalidatePath(`/admin/systems/${systemId}`);
  return { success: true, id: systemId };
}

export async function updateSystemOperationalNotes(
  systemId: string,
  notes: string
): Promise<ActionResult> {
  const { supabase, isStaff } = await getActor();
  if (!isStaff) return { error: "Forbidden: Staff access required" };

  const { error } = await supabase
    .from("systems")
    .update({ operational_notes: notes.trim() })
    .eq("id", systemId);

  if (error) return { error: error.message };

  revalidatePath("/admin/systems");
  revalidatePath(`/admin/systems/${systemId}`);
  return { success: true };
}

export async function retireSystem(systemId: string): Promise<ActionResult> {
  const { supabase, isAdmin } = await getActor();
  if (!isAdmin) return { error: "Forbidden: Admin access required" };

  const { error } = await supabase
    .from("systems")
    .update({ status: "retired", archived_at: new Date().toISOString() })
    .eq("id", systemId);

  if (error) return { error: error.message };

  revalidatePath("/admin/systems");
  return { success: true };
}

export async function createResource(formData: FormData): Promise<ActionResult> {
  const { supabase, isAdmin } = await getActor();
  if (!isAdmin) return { error: "Forbidden: Admin access required" };

  const providerAccountId = formData.get("provider_account_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const resourceType = formData.get("resource_type")?.toString();
  const ownership = formData.get("ownership")?.toString() || "sch_managed";
  const systemIdRaw = formData.get("system_id")?.toString();
  const systemId = systemIdRaw && systemIdRaw.trim() !== "" ? systemIdRaw : null; // explicitly nullable!
  const clientIdRaw = formData.get("client_id")?.toString();
  const clientId = clientIdRaw && clientIdRaw.trim() !== "" ? clientIdRaw : null;
  const externalReference = formData.get("external_reference")?.toString().trim() || null;
  const status = formData.get("status")?.toString() || "active";
  const suspensionCapability = formData.get("suspension_capability")?.toString() || "none";

  if (!providerAccountId || !name || !resourceType) {
    return { error: "Provider Account, Resource Name, and Resource Type are required" };
  }

  const { data, error } = await supabase
    .from("resources")
    .insert({
      provider_account_id: providerAccountId,
      name,
      resource_type: resourceType,
      ownership,
      system_id: systemId,
      client_id: clientId,
      external_reference: externalReference,
      status,
      suspension_capability: suspensionCapability,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/systems");
  return { success: true, id: data.id };
}

export async function updateResourceOperationalNotes(
  resourceId: string,
  notes: string
): Promise<ActionResult> {
  const { supabase, isStaff } = await getActor();
  if (!isStaff) return { error: "Forbidden: Staff access required" };

  const { error } = await supabase
    .from("resources")
    .update({ operational_notes: notes.trim() })
    .eq("id", resourceId);

  if (error) return { error: error.message };

  revalidatePath("/admin/systems");
  return { success: true };
}

export async function retireResource(resourceId: string): Promise<ActionResult> {
  const { supabase, isAdmin } = await getActor();
  if (!isAdmin) return { error: "Forbidden: Admin access required" };

  const { error } = await supabase
    .from("resources")
    .update({ status: "retired", retired_at: new Date().toISOString() })
    .eq("id", resourceId);

  if (error) return { error: error.message };

  revalidatePath("/admin/systems");
  return { success: true };
}

export async function linkProjectToSystem(
  projectId: string,
  systemId: string | null
): Promise<ActionResult> {
  const { supabase, isAdmin } = await getActor();
  if (!isAdmin) return { error: "Forbidden: Admin access required" };

  const { error } = await supabase
    .from("projects")
    .update({ system_id: systemId })
    .eq("id", projectId);

  if (error) return { error: error.message };

  revalidatePath("/admin/systems");
  revalidatePath("/admin/projects");
  return { success: true };
}
