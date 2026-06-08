import type { ReactNode } from "react";
import { NavProgress } from "@/components/nav-progress";
import { PortalSidebar, type NavItem } from "@/components/portal-sidebar";
import { PageTransition } from "@/components/page-transition";
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
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true },
    { href: "/admin/clients", label: "Clients", icon: "clients" },
    { href: "/admin/projects", label: "Projects", icon: "projects" },
    { href: "/admin/bookings", label: "Bookings", icon: "bookings" },
    { href: "/admin/services", label: "Services", icon: "services" },
    { href: "/admin/leads", label: "Quote Requests", icon: "leads" },
    ...(isAdmin
      ? ([
          { href: "/admin/academy", label: "Academy", icon: "academy" },
          { href: "/admin/invoices", label: "Invoices", icon: "invoices" },
          { href: "/admin/reports", label: "Reports", icon: "reports" },
        ] as NavItem[])
      : []),
  ];

  const userLabel = profile?.full_name || profile?.email || user.email || "Admin";
  const userEmail = profile?.email || user.email || "";

  return (
    <div className="portal-shell">
      <NavProgress />
      <div className="flex min-h-screen">
        <PortalSidebar
          brandName="Synergy Concepts Hub"
          brandSub="Control Center"
          items={items}
          userLabel={userLabel}
          userRole={isAdmin ? "Administrator" : "Staff"}
          userEmail={userEmail}
        />
        <main className="portal-main">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
