"use client";

import { NavLink as Link } from "@/components/nav-link";
import { useRouter } from "next/navigation";
import type { BookingStatus, BookingType } from "@/lib/types";

interface CalendarEvent {
  id: string;
  title: string;
  type: BookingType;
  status: BookingStatus;
  scheduled_at: string;
  client_name: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function CalendarView({
  year,
  month,
  events,
  statusBadge,
  typeLabel,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  statusBadge: Record<BookingStatus, string>;
  typeLabel: Record<BookingType, string>;
}) {
  const router = useRouter();

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  function eventsForDay(day: number) {
    return events.filter((e) => {
      const d = new Date(e.scheduled_at);
      return d.getDate() === day;
    });
  }

  const cells: React.ReactNode[] = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push(
      <div key={`empty-${i}`} className="min-h-[120px] bg-gray-100" />
    );
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEvents = eventsForDay(day);
    const isToday =
      new Date().toDateString() ===
      new Date(year, month - 1, day).toDateString();

    cells.push(
      <div
        key={day}
        className={`min-h-[120px] border border-gray-200 bg-white p-2 transition-shadow hover:shadow-sm ${
          isToday ? "ring-2 ring-sch-orange" : ""
        }`}
      >
        <div
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-base font-bold ${
            isToday
              ? "bg-sch-orange text-white"
              : "bg-gray-100 text-gray-900"
          }`}
        >
          {day}
        </div>
        <div className="mt-1 space-y-1">
          {dayEvents.map((e) => (
            <Link
              key={e.id}
              href={`/admin/bookings/${e.id}`}
              className="block rounded px-1.5 py-1 text-xs leading-tight hover:bg-gray-50"
            >
              <span
                className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${statusBadge[e.status]}`}
              >
                {typeLabel[e.type]}
              </span>
              <div className="mt-0.5 truncate font-medium text-gray-800">
                {e.title}
              </div>
              <div className="truncate text-[10px] text-gray-400">
                {e.client_name}
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() =>
              router.push(
                `/admin/bookings/calendar?month=${prevMonth}&year=${prevYear}`
              )
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Previous
          </button>
          <button
            onClick={() =>
              router.push(
                `/admin/bookings/calendar?month=${nextMonth}&year=${nextYear}`
              )
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-gray-300 px-2 py-3 text-center text-sm font-bold uppercase tracking-wide text-gray-900"
          >
            {d}
          </div>
        ))}
        {cells}
      </div>
    </div>
  );
}
