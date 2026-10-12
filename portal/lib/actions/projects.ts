"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, projectUpdateEmail } from "@/lib/email/notify";
import { deliverableStoragePath, isUuid, safeFileName } from "@/lib/security/access";
import {
  createDeliverableUploadIntent,
  verifyDeliverableUploadIntent,
  verifyUploadedObject,
} from "@/lib/security/deliverable-upload-intent";
import { validateDeliverableFile, validateDeliverableLabel } from "@/lib/deliverables";
import { MILESTONE_STATUSES } from "@/lib/types";
import type { MilestoneStatus, ProjectStatus } from "@/lib/types";
import { isAdmin as isAdminRole, isOperationalStaff } from "@/lib/security/roles";
import { checkApplicationAccess } from "@/lib/actions/application-suspension";

type ActionResult = { error?: string; success?: boolean; id?: string };

async function requireStaff() {
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
  const isAdmin = isAdminRole(profile?.role);
  return { supabase, user, isStaff, isAdmin };
}

export async function recalcProjectProgress(
  projectId: string
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const { data: milestones } = await supabase
    .from("project_milestones")
    .select("weight_percent, status")
    .eq("project_id", projectId);

  const progress = (milestones ?? [])
    .filter((m) => m.status === "approved")
    .reduce((sum, m) => sum + (m.weight_percent ?? 0), 0);

  const { error } = await supabase
    .from("projects")
    .update({ progress_percent: Math.min(progress, 100) })
    .eq("id", projectId);

  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/client/projects/${projectId}`);
  return { success: true };
}

export async function createProject(formData: FormData): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const title = (formData.get("title") as string)?.trim();
  const client_id = formData.get("client_id") as string;
  if (!title || !client_id) return { error: "Title and client are required" };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title,
      client_id,
      description: (formData.get("description") as string) || null,
      status: (formData.get("status") as ProjectStatus) || "active",
      start_date: (formData.get("start_date") as string) || null,
      target_date: (formData.get("target_date") as string) || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/admin/projects");
  return { success: true, id: data.id };
}

export async function updateProject(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const progress = formData.get("progress_percent");
  const { error } = await supabase
    .from("projects")
    .update({
      title: (formData.get("title") as string)?.trim(),
      description: (formData.get("description") as string) || null,
      status: formData.get("status") as ProjectStatus,
      progress_percent: progress ? Number(progress) : undefined,
      target_date: (formData.get("target_date") as string) || null,
    })
    .eq("id", projectId);

  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  return { success: true };
}

export async function addMilestone(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const title = (formData.get("title") as string)?.trim();
  if (!title) return { error: "Milestone title is required" };

  const { error } = await supabase.from("project_milestones").insert({
    project_id: projectId,
    title,
    description: (formData.get("description") as string) || null,
    weight_percent: Number(formData.get("weight_percent") || 0),
    due_date: (formData.get("due_date") as string) || null,
    status: "pending",
  });

  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

export async function setMilestoneStatus(
  milestoneId: string,
  _projectId: string,
  status: MilestoneStatus
): Promise<ActionResult> {
  const { supabase, user, isStaff } = await requireStaff();
  if (!user) return { error: "Unauthorized" };
  if (!isUuid(milestoneId)) return { error: "Invalid milestone" };
  if (!(MILESTONE_STATUSES as readonly string[]).includes(status)) return { error: "Invalid status" };

  // Load the milestone through the caller's session (row-level security): the
  // project id used below comes from the database record, not from the browser.
  const { data: milestone } = await supabase
    .from("project_milestones")
    .select("id, project_id, status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return { error: "Milestone not found" };
  const projectId = milestone.project_id as string;

  // Clients may only respond to a milestone that staff have submitted.
  if (!isStaff) {
    const access = await checkApplicationAccess(user.id);
    if (!access.ok) return { error: access.error };

    if (milestone.status !== "submitted" || (status !== "approved" && status !== "revision_requested")) {
      return { error: "Forbidden" };
    }
  }

  const { error } = await supabase
    .from("project_milestones")
    .update({
      status,
      completed_at: status === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", milestoneId);

  if (error) return { error: error.message };

  // Recalculate project progress from approved milestone weights. Clients have no
  // write access to projects, so this derived value is written with the service
  // role, only after the caller has been authorised above.
  const { data: allMilestones } = await supabase
    .from("project_milestones")
    .select("weight_percent, status")
    .eq("project_id", projectId);

  if (allMilestones) {
    const progress = allMilestones
      .filter((m) => m.status === "approved")
      .reduce((sum, m) => sum + (m.weight_percent ?? 0), 0);

    await createAdminClient()
      .from("projects")
      .update({ progress_percent: Math.min(progress, 100) })
      .eq("id", projectId);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/client/projects/${projectId}`);
  return { success: true };
}

export async function addUpdate(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, isStaff } = await requireStaff();
  if (!user) return { error: "Unauthorized" };
  if (!isUuid(projectId)) return { error: "Invalid project" };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Update content is required" };

  // Only staff can write internal notes (the database enforces this as well).
  const is_internal = isStaff && formData.get("is_internal") === "on";

  const { error } = await supabase.from("project_updates").insert({
    project_id: projectId,
    author_id: user.id,
    content,
    is_internal,
  });

  if (error) return { error: error.message };

  // Notify the client when an admin posts a client-visible update
  if (!is_internal) {
    const { data: project } = await supabase
      .from("projects")
      .select("title, client_id")
      .eq("id", projectId)
      .single();

    if (project && project.client_id !== user.id) {
      const { data: client } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", project.client_id)
        .single();

      if (client?.email) {
        const base =
          process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000";
        await sendEmail({
          to: client.email,
          subject: `Update on "${project.title}"`,
          html: projectUpdateEmail(
            project.title,
            content,
            `${base}/client/projects/${projectId}`
          ),
        });
      }
    }
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/client/projects/${projectId}`);
  return { success: true };
}

// Deliverable files upload straight from the browser to Supabase Storage with
// a signed URL. Sending them through a server action would pipe the whole file
// through the app server — past ~1MB the platform rejects the request with
// 413 before the action even runs.
const deliverableIntentSecret = () => {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing upload-intent signing secret");
  return secret;
};

async function canAccessProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<boolean> {
  const { data, error } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  return !error && data?.id === projectId;
}

export async function prepareDeliverableUpload(
  projectId: string,
  file: { name: string; size: number; type: string }
): Promise<{ path?: string; token?: string; intent?: string; contentType?: string; error?: string }> {
  const { supabase, user, isStaff } = await requireStaff();
  if (!user || !isStaff) return { error: "Forbidden" };
  if (!isUuid(projectId) || !(await canAccessProject(supabase, projectId))) return { error: "Project not found" };
  if (!file || typeof file.name !== "string" || typeof file.size !== "number" || typeof file.type !== "string") {
    return { error: "Invalid file" };
  }

  const validation = validateDeliverableFile({ fileName: file.name, fileSize: file.size, fileType: file.type });
  if (validation.error || !validation.contentType) return { error: validation.error ?? "Invalid file" };

  const path = `${projectId}/${randomUUID()}-${safeFileName(file.name)}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("deliverables").createSignedUploadUrl(path);
  if (error || !data) return { error: "Could not prepare upload" };

  const intent = createDeliverableUploadIntent({
    userId: user.id,
    projectId,
    path: data.path,
    fileSize: file.size,
    contentType: validation.contentType,
  }, deliverableIntentSecret());
  return { path: data.path, token: data.token, intent, contentType: validation.contentType };
}

export async function registerDeliverable(
  projectId: string,
  input: { intent: string; name: string; isVisible: boolean }
): Promise<ActionResult> {
  const { supabase, user, isStaff } = await requireStaff();
  if (!user || !isStaff) return { error: "Forbidden" };
  if (!isUuid(projectId) || !(await canAccessProject(supabase, projectId))) return { error: "Project not found" };
  if (!input || typeof input.intent !== "string" || typeof input.name !== "string" || typeof input.isVisible !== "boolean") {
    return { error: "Invalid upload registration" };
  }

  const verified = verifyDeliverableUploadIntent(input.intent, deliverableIntentSecret(), { userId: user.id, projectId });
  if (verified.error || !verified.intent) return { error: verified.error ?? "Invalid upload intent" };
  const intent = verified.intent;
  const name = validateDeliverableLabel(input.name);
  if (!name) return { error: "Enter a valid display name (180 characters or fewer)" };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("deliverables").select("id").eq("file_url", intent.path).maybeSingle();
  if (existing) return { error: "This file has already been registered" };

  const { data: object, error: infoError } = await admin.storage.from("deliverables").info(intent.path);
  if (infoError || !object) return { error: "Uploaded file was not found" };
  const objectCheck = verifyUploadedObject(intent, object);
  if (objectCheck.error || objectCheck.fileSize === undefined || !objectCheck.contentType) {
    return { error: objectCheck.error ?? "Uploaded file metadata is invalid" };
  }

  const { error } = await admin.from("deliverables").insert({
    project_id: projectId,
    name,
    file_url: intent.path,
    file_type: objectCheck.contentType,
    file_size_bytes: objectCheck.fileSize,
    is_visible_to_client: input.isVisible,
  });
  if (error) {
    const { data: registered } = await admin.from("deliverables").select("id").eq("file_url", intent.path).maybeSingle();
    return { error: registered ? "This file has already been registered" : "Could not register the uploaded file" };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/client/projects/${projectId}`);
  return { success: true };
}

export async function setDeliverableVisibility(
  projectId: string,
  deliverableId: string,
  visible: boolean
): Promise<ActionResult> {
  const { supabase, user, isStaff } = await requireStaff();
  if (!user || !isStaff) return { error: "Forbidden" };
  if (!isUuid(projectId) || !isUuid(deliverableId) || typeof visible !== "boolean") {
    return { error: "Invalid deliverable visibility request" };
  }
  if (!(await canAccessProject(supabase, projectId))) return { error: "Project not found" };

  const { data, error } = await supabase.rpc("set_deliverable_visibility", {
    p_deliverable_id: deliverableId,
    p_project_id: projectId,
    p_visible: visible,
  });
  if (error) {
    console.error("set_deliverable_visibility failed:", error.message);
    return { error: "Could not change deliverable visibility" };
  }
  const result = data as { reason?: string } | null;
  if (result?.reason === "not_found") return { error: "Deliverable not found" };

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/client/projects/${projectId}`);
  return { success: true };
}

export async function assignStaff(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireStaff();
  if (!isAdmin) return { error: "Forbidden" };

  const staff_id = formData.get("staff_id") as string;
  if (!staff_id) return { error: "Staff member is required" };

  const { error } = await supabase.from("project_assignments").insert({
    project_id: projectId,
    staff_id,
  });

  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

export async function removeStaffAssignment(
  assignmentId: string
): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireStaff();
  if (!isAdmin) return { error: "Forbidden" };

  const { error } = await supabase
    .from("project_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) return { error: error.message };
  revalidatePath("/admin/projects");
  return { success: true };
}

export async function getDeliverableDownloadUrl(
  deliverableId: string
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  if (!isUuid(deliverableId)) return { error: "File not found" };

  // Authorise from the database record. This read runs under the caller's own
  // session, so row-level security returns the row only to staff, or to the
  // owning client when the deliverable is visible. A hidden file, another
  // client's file or a made-up id all come back empty.
  const { data: deliverable } = await supabase
    .from("deliverables")
    .select("id, project_id, file_url, is_visible_to_client")
    .eq("id", deliverableId)
    .maybeSingle();
  if (!deliverable) return { error: "File not found" };

  // The storage path is taken from that record, never from the browser, and
  // must sit inside the deliverable's own project folder.
  const path = deliverableStoragePath(deliverable);
  if (!path) return { error: "File not found" };

  // Only now use the service role, purely to sign a short-lived URL.
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("deliverables")
    .createSignedUrl(path, 60 * 5); // 5 minutes

  if (error) return { error: "Could not generate download link" };
  return { url: data.signedUrl };
}
