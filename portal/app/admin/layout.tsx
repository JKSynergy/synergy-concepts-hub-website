import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
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

  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white shadow">
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900">SCH Admin</h2>
        </div>
        <nav className="space-y-1 px-3 pb-4">
          <Link
            href="/admin"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/clients"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Clients
          </Link>
          <Link
            href="/admin/projects"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Projects
          </Link>
          <Link
            href="/admin/bookings"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Bookings
          </Link>
          <Link
            href="/admin/services"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Services
          </Link>
          <Link
            href="/admin/leads"
            className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Quote Requests
          </Link>
          {isAdmin && (
            <Link
              href="/admin/academy"
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Academy
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/invoices"
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Invoices
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/reports"
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Reports
            </Link>
          )}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
