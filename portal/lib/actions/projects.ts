"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, projectUpdateEmail } from "@/lib/email/notify";
import type { MilestoneStatus, ProjectStatus } from "@/lib/types";

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

  const isStaff = profile?.role === "admin" || profile?.role === "staff";
  const isAdmin = profile?.role === "admin";
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
  projectId: string,
  status: MilestoneStatus
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("project_milestones")
    .update({
      status,
      completed_at: status === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", milestoneId);

  if (error) return { error: error.message };

  // Recalculate project progress from approved milestone weights
  const { data: allMilestones } = await supabase
    .from("project_milestones")
    .select("weight_percent, status")
    .eq("project_id", projectId);

  if (allMilestones) {
    const progress = allMilestones
      .filter((m) => m.status === "approved")
      .reduce((sum, m) => sum + (m.weight_percent ?? 0), 0);

    await supabase
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Update content is required" };

  const is_internal = formData.get("is_internal") === "on";

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

export async function uploadDeliverable(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const { isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const file = formData.get("file") as File | null;
  const name = ((formData.get("name") as string) || file?.name || "").trim();
  if (!file || file.size === 0) return { error: "A file is required" };

  const admin = createAdminClient();
  const path = `${projectId}/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("deliverables")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return { error: uploadError.message };

  const { error } = await admin.from("deliverables").insert({
    project_id: projectId,
    name,
    file_url: path,
    file_type: file.type,
    file_size_bytes: file.size,
    is_visible_to_client: formData.get("is_visible_to_client") !== "off",
  });

  if (error) return { error: error.message };
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
  filePath: string
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // RLS on the deliverables table already gates visibility; we use the
  // service-role client only to mint a short-lived signed URL.
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("deliverables")
    .createSignedUrl(filePath, 60 * 15); // 15 minutes

  if (error) return { error: error.message };
  return { url: data.signedUrl };
}
