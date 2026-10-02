"use client";

import type { ReactNode } from "react";
import { AppShell, type ShellGroup } from "./app-shell";

const GROUPS: ShellGroup[] = [
  {
    ariaLabel: "Client",
    items: [
      { href: "/client", label: "Dashboard", match: ["/client"], exact: true },
      { href: "/client/projects", label: "Projects", match: ["/client/projects"] },
      { href: "/client/bookings", label: "Bookings", match: ["/client/bookings"] },
      { href: "/client/invoices", label: "Invoices", match: ["/client/invoices"] },
      { href: "/client/profile", label: "Profile", match: ["/client/profile"] },
    ],
  },
];

export function ClientShell({ userLabel, children }: { userLabel: string; children: ReactNode }) {
  return (
    <AppShell groups={GROUPS} brandSub="Client portal" userLabel={userLabel} userRole="Client">
      {children}
    </AppShell>
  );
}
