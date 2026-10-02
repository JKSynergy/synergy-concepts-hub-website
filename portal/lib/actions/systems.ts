"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
