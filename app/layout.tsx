import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelapseClinic — Front desk",
  description: "Clinic front desk: appointments, prescriptions on WhatsApp, and follow-up reminders.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

