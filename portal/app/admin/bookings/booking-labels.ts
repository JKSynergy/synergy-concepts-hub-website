import type { Tone } from "@/components/ux/primitives";

export const BOOKING_TONE: Record<string, Tone> = {
  pending: "warning",
  confirmed: "info",
  completed: "success",
  cancelled: "neutral",
};

export const BOOKING_TYPE_TEXT: Record<string, string> = {
  consultation: "Consultation",
  service_package: "Service package",
  academy_enrollment: "Academy enrolment",
  custom_request: "Custom request",
};

export function bookingTypeText(t: string): string {
  return BOOKING_TYPE_TEXT[t] ?? t.replace(/_/g, " ");
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
