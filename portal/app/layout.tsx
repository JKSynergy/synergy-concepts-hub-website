import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

// Sets the theme before first paint so there is no light/dark flash.
// Saved choice (components/ux/theme-toggle.tsx) wins; otherwise the device setting.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("sch-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t}catch(e){}})()`;

export const metadata: Metadata = {
  title: "SCH Portal",
  applicationName: "Synergy Concepts Hub Portal",
  description: "Synergy Concepts Hub Client & Admin Portal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SCH Portal",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/images/sch-logo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/sch-logo-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/images/sch-logo-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0F19",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
