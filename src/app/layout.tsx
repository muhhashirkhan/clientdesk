import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "ClientDesk · Aiquor", template: "%s · ClientDesk" },
  description:
    "Your projects, conversations and approvals. Together in Aiquor’s private client portal.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
