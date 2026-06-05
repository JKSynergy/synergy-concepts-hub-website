export type ProjectStatus =
  | "lead"
  | "quoted"
  | "active"
  | "review"
  | "completed"
  | "archived";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "lead",
  "quoted",
  "active",
  "review",
  "completed",
  "archived",
];

export const MILESTONE_STATUSES = [
  "pending",
  "in_progress",
  "submitted",
  "approved",
  "revision_requested",
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface Project {
  id: string;
  client_id: string;
  booking_id: string | null;
  title: string;
  description: string | null;
  status: ProjectStatus;
  progress_percent: number;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAssignment {
  id: string;
  project_id: string;
  staff_id: string;
  created_at: string;
}

export interface AcademyCourse {
  id: string;
  name: string;
  description: string | null;
  duration_weeks: number | null;
  price_ugx: number | null;
  price_usd: number | null;
  intake_dates: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  weight_percent: number;
  status: MilestoneStatus;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  author_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface Deliverable {
  id: string;
  project_id: string;
  name: string;
  file_url: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  is_visible_to_client: boolean;
  created_at: string;
}

export const BOOKING_TYPES = [
  "consultation",
  "service_package",
  "academy_enrollment",
  "custom_request",
] as const;

export type BookingType = (typeof BOOKING_TYPES)[number];

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  consultation: "Consultation",
  service_package: "Service Package",
  academy_enrollment: "Academy Enrollment",
  custom_request: "Custom Request",
};

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export interface Profile {
  id: string;
  email: string;
  role: "admin" | "staff" | "client";
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  billing_address: string | null;
  tax_id: string | null;
  external_portal_url: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadStatus = "new" | "contacted" | "converted" | "archived";

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-500",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-400",
};

export interface Service {
  id: string;
  name: string;
  description: string | null;
  price_ugx: number | null;
  price_usd: number | null;
  duration_days: number | null;
  deliverables: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  client_id: string;
  type: BookingType;
  status: BookingStatus;
  service_id: string | null;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  service_interest: string | null;
  message: string | null;
  status: LeadStatus;
  source: string | null;
  converted_client_id: string | null;
  created_at: string;
}

export const STATUS_BADGE: Record<ProjectStatus, string> = {
  lead: "bg-gray-100 text-gray-700",
  quoted: "bg-blue-100 text-blue-700",
  active: "bg-amber-100 text-amber-700",
  review: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-500",
};

export interface Invoice {
  id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  created_at: string;
}

export const PAYMENT_METHODS = [
  "paystack",
  "mobile_money",
  "bank_transfer",
  "cash",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paystack_reference: string | null;
  paid_at: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  payment_id: string;
  invoice_id: string;
  receipt_number: string;
  pdf_url: string | null;
  created_at: string;
}
