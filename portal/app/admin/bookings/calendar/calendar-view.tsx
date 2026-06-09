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
      <div key={`empty-${i}`} className="min-h-[80px] bg-gray-100 sm:min-h-[120px]" />
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
        className={`min-h-[80px] border border-gray-200 bg-white p-1 transition-shadow hover:shadow-sm sm:min-h-[120px] sm:p-2 ${
          isToday ? "ring-2 ring-sch-orange" : ""
        }`}
      >
        <div
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold sm:h-7 sm:w-7 sm:text-base ${
            isToday
              ? "bg-sch-orange text-white"
              : "bg-gray-100 text-gray-900"
          }`}
        >
          {day}
        </div>
        <div className="mt-0.5 space-y-0.5 sm:mt-1 sm:space-y-1">
          {dayEvents.map((e) => (
            <Link
              key={e.id}
              href={`/admin/bookings/${e.id}`}
              className="block rounded px-1 py-0.5 text-[10px] leading-tight hover:bg-gray-50 sm:px-1.5 sm:py-1 sm:text-xs"
            >
              <span
                className={`inline-block rounded-full px-1 py-0 text-[8px] font-medium capitalize sm:px-1.5 sm:py-0.5 sm:text-[10px] ${statusBadge[e.status]}`}
              >
                {typeLabel[e.type]}
              </span>
              <div className="mt-0.5 truncate font-medium text-gray-800">
                {e.title}
              </div>
              <div className="truncate text-[8px] text-gray-400 sm:text-[10px]">
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
        <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() =>
              router.push(
                `/admin/bookings/calendar?month=${prevMonth}&year=${prevYear}`
              )
            }
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3 sm:text-sm"
          >
            Prev
          </button>
          <button
            onClick={() =>
              router.push(
                `/admin/bookings/calendar?month=${nextMonth}&year=${nextYear}`
              )
            }
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3 sm:text-sm"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
        {[
          { full: "Sun", abbr: "Su" },
          { full: "Mon", abbr: "Mo" },
          { full: "Tue", abbr: "Tu" },
          { full: "Wed", abbr: "We" },
          { full: "Thu", abbr: "Th" },
          { full: "Fri", abbr: "Fr" },
          { full: "Sat", abbr: "Sa" },
        ].map((d) => (
          <div
            key={d.full}
            className="bg-gray-300 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-900 sm:px-2 sm:py-3 sm:text-sm"
          >
            <span className="hidden sm:inline">{d.full}</span>
            <span className="sm:hidden">{d.abbr}</span>
          </div>
        ))}
        {cells}
      </div>
    </div>
  );
}
