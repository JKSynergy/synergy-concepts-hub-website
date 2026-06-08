"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { startNavProgress } from "./nav-progress";

/* Drop-in replacement for next/link that kicks off the top progress bar
   on client-side navigation. */
export function NavLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onNavigate={(e) => {
        startNavProgress();
        onNavigate?.(e);
      }}
    />
  );
}

export default NavLink;
