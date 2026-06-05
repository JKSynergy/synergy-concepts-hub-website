"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string; success?: boolean };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  return { supabase, user, isAdmin };
}

export async function saveAcademyCourse(
  courseId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required" };

  const payload = {
    name,
    description: (formData.get("description") as string) || null,
    duration_weeks: formData.get("duration_weeks")
      ? Number(formData.get("duration_weeks"))
      : null,
    price_ugx: formData.get("price_ugx")
      ? Number(formData.get("price_ugx"))
      : null,
    price_usd: formData.get("price_usd")
      ? Number(formData.get("price_usd"))
      : null,
    intake_dates: (formData.get("intake_dates") as string) || null,
    is_active: formData.get("is_active") !== "off",
  };

  if (courseId) {
    const { error } = await supabase
      .from("academy_courses")
      .update(payload)
      .eq("id", courseId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("academy_courses").insert(payload);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/academy");
  return { success: true };
}

export async function toggleCourseActive(
  courseId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) return { error: "Forbidden" };

  const { error } = await supabase
    .from("academy_courses")
    .update({ is_active: isActive })
    .eq("id", courseId);

  if (error) return { error: error.message };
  revalidatePath("/admin/academy");
  return { success: true };
}
