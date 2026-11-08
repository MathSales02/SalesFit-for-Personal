import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Variable font (all weights in one file), self-hosted by next/font: no request to Google from the browser.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Cadência", template: "%s · Cadência" },
  description: "Plataforma para personal trainers e alunos: treinos, evolução e comunidade.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#eef1f6", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page dynamic, which the per-request CSP nonce requires.
  await headers();
  return (
    <html lang="pt-BR" className={sora.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
