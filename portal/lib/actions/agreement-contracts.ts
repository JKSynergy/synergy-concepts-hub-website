"use server";

// Agreements as contracts (migration 038): create from a package, edit the
// contract terms, move through proposal → acceptance → active, keep the
// signed PDF, and bill each period. The database enforces every rule again.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { canAccessFinance } from "@/lib/security/roles";
import { isUuid } from "@/lib/security/access";
import { cleanTargets, type ResponseTarget } from "@/lib/billing/response-targets";
import { sendEmail } from "@/lib/email/notify";
import { getPortalBaseUrl } from "@/lib/portal-url";

export type ActionResult<T = unknown> = { ok: boolean; data?: T; error?: string };

const BUCKET = "agreement-documents";
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const dbError = (message: string) => message.replace(/^.*?ERROR:\s*/i, "").replace(/\s*\(SQLSTATE.*$/, "");
const intIn = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

async function finance() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication required" as string };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!canAccessFinance(profile?.role)) return { error: "Permission denied: Admin or Finance access required" as string };
  return { supabase, user, role: profile!.role as string };
}

function refresh(agreementId?: string) {
  revalidatePath("/admin/agreements");
  if (agreementId) revalidatePath(`/admin/agreements/${agreementId}`);
  revalidatePath("/admin/invoices");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type NewAgreementInput = {
  clientId: string;
  name: string;
  startDate: string;
  plan: "monthly" | "annual";
  packageId?: string | null;
  amount?: number | null;
  currency?: string | null;
  systemId?: string | null;
  status: "draft" | "active";
  invoiceTiming: "in_advance" | "in_arrears";
  paymentDueDays: number;
  contractReference?: string | null;
};

export async function createAgreementFromPackage(input: NewAgreementInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await finance();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(input.clientId)) return { ok: false, error: "Choose a client" };
  const name = text(input.name, 160);
  if (!name || name.length < 2) return { ok: false, error: "Give the agreement a name" };
  if (!DATE.test(input.startDate ?? "")) return { ok: false, error: "Choose the start date" };
  if (input.packageId && !isUuid(input.packageId)) return { ok: false, error: "Invalid package" };
  if (input.systemId && !isUuid(input.systemId)) return { ok: false, error: "Invalid system" };
  if (!input.packageId && !(Number(input.amount) > 0)) return { ok: false, error: "Choose a package or enter an amount" };

  const { data, error } = await ctx.supabase.rpc("create_agreement_from_package", {
    p_client_id: input.clientId,
    p_name: name,
    p_start_date: input.startDate,
    p_plan: input.plan === "annual" ? "annual" : "monthly",
    p_package_id: input.packageId || null,
    p_amount: input.packageId ? null : Math.round(Number(input.amount) * 100) / 100,
    p_currency: input.currency === "USD" ? "USD" : "UGX",
    p_system_id: input.systemId || null,
    p_status: input.status === "active" ? "active" : "draft",
    p_invoice_timing: input.invoiceTiming === "in_advance" ? "in_advance" : "in_arrears",
    p_payment_due_days: intIn(input.paymentDueDays, 0, 120, 14),
    p_contract_reference: text(input.contractReference, 80),
  });

  await writeAuditLog(createAdminClient(), {
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: error ? "AGREEMENT_CREATE_FAILED" : "AGREEMENT_CREATED",
    table: "service_agreements",
    recordId: error ? null : (data as string),
    details: { package_id: input.packageId ?? null, plan: input.plan, status: input.status, ...(error ? { error: error.message } : {}) },
  });

  if (error || !data) return { ok: false, error: dbError(error?.message ?? "Could not create the agreement") };
  refresh(data as string);
  return { ok: true, data: { id: data as string } };
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export type AgreementTermsInput = {
  name?: string;
  contractReference?: string | null;
  systemId?: string | null;
  scopeIncluded?: string | null;
  scopeExcluded?: string | null;
  responseTargets?: ResponseTarget[] | null;
  invoiceTiming?: "in_advance" | "in_arrears";
  paymentDueDays?: number;
  graceDays?: number;
  noticeDays?: number;
  renewalDate?: string | null;
  endDate?: string | null;
};

export async function updateAgreementTerms(id: string, input: AgreementTermsInput): Promise<ActionResult> {
  const ctx = await finance();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid agreement" };

  const row: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const n = text(input.name, 160);
    if (!n || n.length < 2) return { ok: false, error: "Give the agreement a name" };
    row.name = n;
  }
  if (input.contractReference !== undefined) row.contract_reference = text(input.contractReference, 80);
  if (input.systemId !== undefined) {
    if (input.systemId && !isUuid(input.systemId)) return { ok: false, error: "Invalid system" };
    row.system_id = input.systemId || null;
  }
  if (input.scopeIncluded !== undefined) row.scope_included = text(input.scopeIncluded, 4000);
  if (input.scopeExcluded !== undefined) row.scope_excluded = text(input.scopeExcluded, 4000);
  if (input.responseTargets !== undefined) row.response_targets = cleanTargets(input.responseTargets);
  if (input.invoiceTiming !== undefined) {
    row.invoice_timing = input.invoiceTiming === "in_advance" ? "in_advance" : "in_arrears";
    row.payment_timing = input.invoiceTiming === "in_advance" ? "advance" : "month_end";
  }
  if (input.paymentDueDays !== undefined) row.payment_due_days = intIn(input.paymentDueDays, 0, 120, 14);
  if (input.graceDays !== undefined) row.default_grace_days = intIn(input.graceDays, 0, 120, 7);
  if (input.noticeDays !== undefined) row.notice_days = intIn(input.noticeDays, 0, 120, 3);
  for (const [key, col] of [
    ["renewalDate", "renewal_date"],
    ["endDate", "end_date"],
  ] as const) {
    const v = input[key];
    if (v === undefined) continue;
    if (v && !DATE.test(v)) return { ok: false, error: "Invalid date" };
    row[col] = v || null;
  }
  if (!Object.keys(row).length) return { ok: true };

  const { error } = await ctx.supabase.from("service_agreements").update(row).eq("id", id);
  if (error) return { ok: false, error: dbError(error.message) };
  refresh(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lifecycle: draft → sent → accepted → active
// ---------------------------------------------------------------------------

export async function setAgreementStage(
  id: string,
  stage: "draft" | "sent" | "accepted" | "active",
  acceptance?: { name: string; title?: string | null; at: string },
): Promise<ActionResult> {
  const ctx = await finance();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid agreement" };

  const { data: cur } = await ctx.supabase.from("service_agreements").select("status").eq("id", id).single();
  if (!cur) return { ok: false, error: "Agreement not found" };
  const allowed: Record<string, string[]> = {
    draft: ["sent", "accepted", "active"],
    sent: ["draft", "accepted", "active"],
    accepted: ["active", "sent"],
  };
  if (!(allowed[cur.status] ?? []).includes(stage)) {
    return { ok: false, error: `An agreement that is ${cur.status} cannot move to ${stage}` };
  }

  const row: Record<string, unknown> = { status: stage };
  if (stage === "accepted") {
    const name = text(acceptance?.name, 120);
    const at = acceptance?.at ? new Date(acceptance.at) : null;
    if (!name || name.length < 2) return { ok: false, error: "Enter who accepted it" };
    if (!at || Number.isNaN(at.getTime())) return { ok: false, error: "Enter when it was accepted" };
    row.accepted_by_name = name;
    row.accepted_by_title = text(acceptance?.title, 120);
    row.accepted_at = at.toISOString();
  }
  if (stage === "sent") row.sent_at = new Date().toISOString();

  const { error } = await ctx.supabase.from("service_agreements").update(row).eq("id", id);
  await writeAuditLog(createAdminClient(), {
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: error ? "AGREEMENT_STAGE_FAILED" : `AGREEMENT_${stage.toUpperCase()}`,
    table: "service_agreements",
    recordId: id,
    details: { from: cur.status, to: stage, ...(error ? { error: error.message } : {}) },
  });
  if (error) return { ok: false, error: dbError(error.message) };
  refresh(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Signed agreement (PDF): signed upload URL → register → signed download URL
// ---------------------------------------------------------------------------

export async function prepareSignedDocumentUpload(
  id: string,
  file: { name: string; size: number; type: string },
): Promise<ActionResult<{ path: string; token: string }>> {
  const ctx = await finance();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid agreement" };
  if (!file || typeof file.size !== "number" || file.size <= 0) return { ok: false, error: "Choose a file" };
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name ?? "")) return { ok: false, error: "Upload the signed agreement as a PDF" };
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: "The PDF must be 10 MB or smaller" };
  const { data: agr } = await ctx.supabase.from("service_agreements").select("id").eq("id", id).maybeSingle();
  if (!agr) return { ok: false, error: "Agreement not found" };

  const path = `${id}/${randomUUID()}.pdf`;
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not prepare the upload" };
  return { ok: true, data: { path: data.path, token: data.token } };
}

export async function registerSignedDocument(id: string, path: string, displayName: string): Promise<ActionResult> {
  const ctx = await finance();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id) || typeof path !== "string" || !path.startsWith(`${id}/`) || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(path)) {
    return { ok: false, error: "Invalid upload" };
  }
  const admin = createAdminClient();
  const { data: info, error: infoError } = await admin.storage.from(BUCKET).info(path);
  if (infoError || !info) return { ok: false, error: "The uploaded file was not found" };
  const size = Number((info as { size?: number }).size ?? 0);
  const type = String((info as { contentType?: string }).contentType ?? "");
  if (size <= 0 || size > MAX_PDF_BYTES || type !== "application/pdf") {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "The signed agreement must be a PDF of 10 MB or less" };
  }

  const name = (text(displayName, 200) ?? "Signed agreement.pdf").replace(/[^\w .()-]/g, "_");
  const { data: prev } = await ctx.supabase.from("service_agreements").select("signed_document_path").eq("id", id).single();
  const { error } = await ctx.supabase
    .from("service_agreements")
    .update({ signed_document_path: path, signed_document_name: name })
    .eq("id", id);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: dbError(error.message) };
  }
  if (prev?.signed_document_path && prev.signed_document_path !== path) {
    await admin.storage.from(BUCKET).remove([prev.signed_document_path]);
  }
  await writeAuditLog(admin, {
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: "AGREEMENT_SIGNED_DOCUMENT_UPLOADED",
    table: "service_agreements",
    recordId: id,
    details: { name, size },
  });
  refresh(id);
  return { ok: true };
}

export async function signedDocumentUrl(id: string): Promise<ActionResult<{ url: string }>> {
  const ctx = await finance();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(id)) return { ok: false, error: "Invalid agreement" };
  const { data: agr } = await ctx.supabase
    .from("service_agreements")
    .select("signed_document_path, signed_document_name")
    .eq("id", id)
    .single();
  if (!agr?.signed_document_path) return { ok: false, error: "No signed agreement uploaded" };
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(agr.signed_document_path, 120, { download: agr.signed_document_name ?? "signed-agreement.pdf" });
  if (error || !data) return { ok: false, error: "Could not open the document" };
  return { ok: true, data: { url: data.signedUrl } };
}

// ---------------------------------------------------------------------------
// Billing: one invoice per period
// ---------------------------------------------------------------------------

export async function billAgreementPeriod(
  chargeId: string,
  periodStart: string,
  send: boolean,
): Promise<ActionResult<{ invoiceId: string; emailed: boolean }>> {
  const ctx = await finance();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isUuid(chargeId) || !DATE.test(periodStart ?? "")) return { ok: false, error: "Invalid period" };

  const { data, error } = await ctx.supabase.rpc("bill_agreement_period", {
    p_charge_id: chargeId,
    p_period_start: periodStart,
    p_send: !!send,
  });

  await writeAuditLog(createAdminClient(), {
    actorId: ctx.user.id,
    actorRole: ctx.role,
    action: error ? "AGREEMENT_PERIOD_BILL_FAILED" : send ? "AGREEMENT_PERIOD_INVOICED_SENT" : "AGREEMENT_PERIOD_INVOICED",
    table: "invoices",
    recordId: error ? null : (data as string),
    details: { recurring_charge_id: chargeId, period_start: periodStart, ...(error ? { error: error.message } : {}) },
  });
  if (error || !data) return { ok: false, error: dbError(error?.message ?? "Could not create the invoice") };

  const invoiceId = data as string;
  let emailed = false;
  if (send) emailed = await emailInvoice(ctx.supabase, invoiceId);

  refresh();
  const { data: ch } = await ctx.supabase.from("recurring_charges").select("agreement_id").eq("id", chargeId).single();
  if (ch?.agreement_id) revalidatePath(`/admin/agreements/${ch.agreement_id}`);
  revalidatePath(`/client/invoices/${invoiceId}`);
  return { ok: true, data: { invoiceId, emailed } };
}

/** Tell the client a new invoice is in their portal (no-op without email configured). */
async function emailInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
): Promise<boolean> {
  const { data: inv } = await supabase
    .from("invoices")
    .select("invoice_number, total, currency, due_date, client:profiles!client_id(email, company_name, full_name)")
    .eq("id", invoiceId)
    .single();
  const client = Array.isArray(inv?.client) ? inv?.client[0] : inv?.client;
  if (!inv || !client?.email) return false;
  const amount = `${inv.currency} ${Number(inv.total).toLocaleString("en-US", {
    minimumFractionDigits: inv.currency === "USD" ? 2 : 0,
    maximumFractionDigits: inv.currency === "USD" ? 2 : 0,
  })}`;
  const link = `${getPortalBaseUrl()}/client/invoices/${invoiceId}`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  await sendEmail({
    to: client.email,
    subject: `Invoice ${inv.invoice_number} from Synergy Concepts Hub`,
    html: `<p>Hello ${esc(client.company_name || client.full_name || "")},</p>
<p>Your invoice <b>${esc(inv.invoice_number)}</b> for <b>${esc(amount)}</b> is ready${inv.due_date ? `, due ${esc(String(inv.due_date))}` : ""}.</p>
<p><a href="${link}">View and download it in your portal</a></p>
<p>Thank you,<br>Synergy Concepts Hub</p>`,
  });
  return true;
}
