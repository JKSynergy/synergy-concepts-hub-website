"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/notify";
import type { BookingStatus, BookingType } from "@/lib/types";

type ActionResult = { error?: string; success?: boolean; id?: string };

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isStaff: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isStaff = profile?.role === "admin" || profile?.role === "staff";
  return { supabase, user, isStaff };
}

// ── Service catalog ──
export async function saveService(
  serviceId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required" };

  const payload = {
    name,
    description: (formData.get("description") as string) || null,
    price_ugx: formData.get("price_ugx")
      ? Number(formData.get("price_ugx"))
      : null,
    price_usd: formData.get("price_usd")
      ? Number(formData.get("price_usd"))
      : null,
    duration_days: formData.get("duration_days")
      ? Number(formData.get("duration_days"))
      : null,
    deliverables: (formData.get("deliverables") as string) || null,
    is_active: formData.get("is_active") !== "off",
  };

  if (serviceId) {
    const { error } = await supabase
      .from("service_catalog")
      .update(payload)
      .eq("id", serviceId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("service_catalog").insert(payload);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/services");
  return { success: true };
}

export async function toggleServiceActive(
  serviceId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const { error } = await supabase
    .from("service_catalog")
    .update({ is_active: isActive })
    .eq("id", serviceId);

  if (error) return { error: error.message };
  revalidatePath("/admin/services");
  return { success: true };
}

// ── Bookings ──
export async function createBooking(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const title = (formData.get("title") as string)?.trim();
  const type = formData.get("type") as BookingType;
  if (!title || !type) return { error: "Title and type are required" };

  const scheduledRaw = formData.get("scheduled_at") as string;
  const courseId = (formData.get("course_id") as string) || null;

  const metadata: Record<string, unknown> = {};
  if (courseId) metadata.course_id = courseId;

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      client_id: user.id,
      type,
      title,
      description: (formData.get("description") as string) || null,
      service_id: (formData.get("service_id") as string) || null,
      scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
      metadata: Object.keys(metadata).length > 0 ? metadata : {},
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Notify staff inbox (best-effort)
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `New booking request: ${title}`,
      html: `<p>A client submitted a new <strong>${type}</strong> booking: ${title}</p>`,
    });
  }

  revalidatePath("/client/bookings");
  revalidatePath("/admin/bookings");
  return { success: true, id: data.id };
}

// Admin/staff manually create a booking on behalf of a client
export async function createBookingForClient(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const clientId = (formData.get("client_id") as string)?.trim();
  const title = (formData.get("title") as string)?.trim();
  const type = formData.get("type") as BookingType;
  if (!clientId) return { error: "Client is required" };
  if (!title || !type) return { error: "Title and type are required" };

  const statusRaw = (formData.get("status") as BookingStatus) || "confirmed";
  const scheduledRaw = formData.get("scheduled_at") as string;
  const courseId = (formData.get("course_id") as string) || null;

  const metadata: Record<string, unknown> = {};
  if (courseId) metadata.course_id = courseId;

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      client_id: clientId,
      type,
      title,
      description: (formData.get("description") as string) || null,
      service_id: (formData.get("service_id") as string) || null,
      scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
      metadata: Object.keys(metadata).length > 0 ? metadata : {},
      status: statusRaw,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/bookings");
  revalidatePath("/client/bookings");
  return { success: true, id: data.id };
}

export async function setBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) return { error: error.message };
  revalidatePath("/admin/bookings");
  revalidatePath("/client/bookings");
  return { success: true };
}

export async function rescheduleBooking(
  bookingId: string,
  scheduledAt: string
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const { error } = await supabase
    .from("bookings")
    .update({ scheduled_at: scheduledAt })
    .eq("id", bookingId);

  if (error) return { error: error.message };
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { success: true };
}

export async function convertBookingToProject(
  bookingId: string
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, client_id, title, description, type, service_id")
    .eq("id", bookingId)
    .single();

  if (!booking) return { error: "Booking not found" };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      client_id: booking.client_id,
      booking_id: booking.id,
      title: booking.title,
      description: booking.description,
      status: "active",
    })
    .select("id")
    .single();

  if (projectError) return { error: projectError.message };

  await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", bookingId);

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/projects");
  return { success: true, id: project.id };
}

// ── Leads ──
export async function setLeadStatus(
  leadId: string,
  status: "new" | "contacted" | "archived"
): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const { error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId);

  if (error) return { error: error.message };
  revalidatePath("/admin/leads");
  return { success: true };
}

// Convert a lead into a client by sending a Supabase invite, then mark converted.
export async function convertLead(leadId: string): Promise<ActionResult> {
  const { supabase, isStaff } = await requireStaff();
  if (!isStaff) return { error: "Forbidden" };

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) return { error: "Lead not found" };

  const admin = createAdminClient();
  const base = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(lead.email, {
    data: {
      role: "client",
      full_name: lead.name,
      phone: lead.phone,
    },
    redirectTo: `${base}/login`,
  });

  if (error) return { error: error.message };

  if (data.user) {
    await admin
      .from("profiles")
      .update({ full_name: lead.name, phone: lead.phone })
      .eq("id", data.user.id);
  }

  await supabase
    .from("leads")
    .update({ status: "converted", converted_client_id: data.user?.id ?? null })
    .eq("id", leadId);

  revalidatePath("/admin/leads");
  revalidatePath("/admin/clients");
  return { success: true, id: data.user?.id };
}
