import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

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
    <html lang="en">
      <body className="min-h-screen antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
