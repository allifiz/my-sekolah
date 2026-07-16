import type { Metadata } from "next";
import "./globals.css";
import "./ui-polish.css";
import "./final-polish.css";
import "./ux-enhancements.css";

export const metadata: Metadata = {
  title: "My Sekolah",
  description: "SaaS manajemen sekolah multi-tenant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
