import type { ReactNode } from "react";
import Link from "next/link";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white shadow">
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900">My Portal</h2>
        </div>
        <nav className="space-y-1 px-3 pb-4">
          <Link
            href="/client"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Dashboard
          </Link>
          <Link
            href="/client/projects"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            My Projects
          </Link>
          <Link
            href="/client/bookings"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Bookings
          </Link>
          <Link
            href="/client/invoices"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Invoices
          </Link>
          <Link
            href="/client/profile"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Profile
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
