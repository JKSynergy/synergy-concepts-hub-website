import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCH Portal",
  description: "Synergy Concepts Hub Client & Admin Portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
