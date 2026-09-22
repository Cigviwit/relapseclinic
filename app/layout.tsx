import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelapseClinic — Appointments & Follow-ups",
  description: "A calmer clinic day. Manage appointments, patients, and follow-up reminders in one place.",
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

