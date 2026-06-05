import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BookingDetailActions from "./booking-detail-actions";
import {
  BOOKING_STATUS_BADGE,
  BOOKING_TYPE_LABEL,
  type BookingStatus,
  type BookingType,
} from "@/lib/types";

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("*, service_catalog(name)")
    .eq("id", id)
    .single();

  if (!booking) notFound();

  const { data: client } = await supabase
    .from("profiles")
    .select("email, full_name, company_name, phone")
    .eq("id", booking.client_id)
    .single();

  const { data: relatedProject } = booking.booking_id
    ? await supabase
        .from("projects")
        .select("id, title, status")
        .eq("booking_id", id)
        .maybeSingle()
    : { data: null };

  const clientLabel =
    client?.company_name || client?.full_name || client?.email || "Unknown";

  const meta = Object.entries((booking.metadata as Record<string, unknown>) ?? {});

  return (
    <div className="space-y-6">
      <Link
        href="/admin/bookings"
        className="text-sm text-sch-blue hover:underline"
      >
        &larr; Back to Bookings
      </Link>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{booking.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {clientLabel}
              {client?.phone && ` \u2022 ${client.phone}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                BOOKING_STATUS_BADGE[booking.status as BookingStatus]
              }`}
            >
              {booking.status}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {BOOKING_TYPE_LABEL[booking.type as BookingType]}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Created
            </span>
            <p className="text-sm text-gray-700">
              {new Date(booking.created_at).toLocaleString()}
            </p>
          </div>
          {booking.scheduled_at && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Scheduled
              </span>
              <p className="text-sm text-gray-700">
                {new Date(booking.scheduled_at).toLocaleString()}
              </p>
            </div>
          )}
          {booking.service_catalog && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Service
              </span>
              <p className="text-sm text-gray-700">
                {(booking.service_catalog as { name: string }).name}
              </p>
            </div>
          )}
        </div>

        {booking.description && (
          <div className="mt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Details
            </span>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
              {booking.description}
            </p>
          </div>
        )}

        {meta.length > 0 && (
          <div className="mt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Metadata
            </span>
            <dl className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {meta.map(([key, value]) => (
                <div key={key} className="text-sm">
                  <dt className="inline text-gray-500">{key}:</dt>{" "}
                  <dd className="inline text-gray-700">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {relatedProject && (
          <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm">
            Linked to project:{" "}
            <Link
              href={`/admin/projects/${relatedProject.id}`}
              className="font-medium text-sch-blue hover:underline"
            >
              {relatedProject.title}
            </Link>
          </div>
        )}

        <div className="mt-6">
          <BookingDetailActions
            bookingId={id}
            status={booking.status as BookingStatus}
            scheduledAt={booking.scheduled_at}
            hasProject={!!relatedProject}
          />
        </div>
      </div>
    </div>
  );
}
