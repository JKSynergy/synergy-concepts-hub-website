"use client";

import { NavLink as Link } from "@/components/nav-link";
import { StatusMark } from "@/components/ux/primitives";
import { BOOKING_TONE, bookingTypeText } from "../booking-labels";
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
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarView({
  year,
  month,
  events,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
}) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay();

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const byDay = new Map<number, CalendarEvent[]>();
  for (const e of events) {
    const d = new Date(e.scheduled_at).getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  const todayStr = new Date().toDateString();
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(<div key={`e${i}`} className="ux-cal-cell ux-cal-cell--empty" aria-hidden />);
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = todayStr === new Date(year, month - 1, day).toDateString();
    const list = byDay.get(day) ?? [];
    cells.push(
      <div key={day} className={`ux-cal-cell${isToday ? " ux-cal-cell--today" : ""}`}>
        <span className="ux-cal-day">{day}</span>
        {list.map((e) => (
          <Link key={e.id} href={`/admin/bookings/${e.id}`} className="ux-cal-event">
            <b>{e.title}</b>
            <span>
              {bookingTypeText(e.type)}
              {" · "}
              {e.client_name}
            </span>
            <StatusMark tone={BOOKING_TONE[e.status] ?? "neutral"}>{e.status}</StatusMark>
          </Link>
        ))}
      </div>
    );
  }

  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(<div key={`t${i}`} className="ux-cal-cell ux-cal-cell--empty" aria-hidden />);

  return (
    <div>
      <div className="ux-toolbar">
        <h2 className="ux-cal-title">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <div className="ux-filters">
          <Link href={`/admin/bookings/calendar?month=${prevMonth}&year=${prevYear}`} className="ux-btn ux-btn--secondary" aria-label="Previous month">
            Previous
          </Link>
          <Link href="/admin/bookings/calendar" className="ux-btn ux-btn--secondary">
            Today
          </Link>
          <Link href={`/admin/bookings/calendar?month=${nextMonth}&year=${nextYear}`} className="ux-btn ux-btn--secondary" aria-label="Next month">
            Next
          </Link>
        </div>
      </div>

      {events.length === 0 && (
        <p className="ux-muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          No scheduled booking requests in {MONTH_NAMES[month - 1]} {year}.
        </p>
      )}

      <div className="ux-cal">
        {DAYS.map((d) => (
          <div key={d} className="ux-cal-dow">
            {d}
          </div>
        ))}
        {cells}
      </div>
    </div>
  );
}
