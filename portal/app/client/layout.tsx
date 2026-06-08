import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavProgress } from "@/components/nav-progress";
import { PortalSidebar, type NavItem } from "@/components/portal-sidebar";
import { PageTransition } from "@/components/page-transition";

const NAV_ITEMS: NavItem[] = [
  { href: "/client", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/client/projects", label: "My Projects", icon: "projects" },
  { href: "/client/bookings", label: "Bookings", icon: "bookings" },
  { href: "/client/invoices", label: "Invoices", icon: "invoices" },
  { href: "/client/profile", label: "Profile", icon: "profile" },
];

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, full_name, email")
    .eq("id", user.id)
    .single();

  const userLabel =
    profile?.company_name || profile?.full_name || profile?.email || user.email || "Client";
  const userEmail = profile?.email || user.email || "";

  return (
    <div className="portal-shell">
      <NavProgress />
      <div className="flex min-h-screen">
        <PortalSidebar
          brandName="Client Portal"
          brandSub="Synergy Concepts Hub"
          items={NAV_ITEMS}
          userLabel={userLabel}
          userRole="Client"
          userEmail={userEmail}
        />
        <main className="portal-main">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
