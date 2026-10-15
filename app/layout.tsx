import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/provider";

export const metadata: Metadata = {
  title: "AgentOS — Mission Control",
  description: "A policy-bound runtime for autonomous agents. Execute, verify, and settle with confidence. ETH Shenzhen 2026 prototype.",
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
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased"><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
