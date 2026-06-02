import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ringee for ChatGPT",
  description:
    "Operate Ringee — outbound calling, contacts, leads, call sessions, callbacks and meetings — inside ChatGPT.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
