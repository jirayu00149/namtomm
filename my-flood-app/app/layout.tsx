import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "rodnam Dashboard",
  description: "Flood relief command dashboard for reports, drone missions and YOLO water-level events.",
  icons: {
    icon: "/rodnam-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}