import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import { cookies, headers } from "next/headers";
import { PwaSetup } from "@/components/pwa";
import { parseTheme, THEME_COOKIE, themeClass } from "@/lib/theme";
import "./globals.css";

// Variable font (all weights in one file), self-hosted by next/font: no request to Google from the browser.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });

// A function, so APP_URL is read on the server at request time (not at build time):
// share images (og:image) then point to the real site.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: "Cadência", template: "%s · Cadência" },
    description: "Plataforma para personal trainers e alunos: treinos, evolução e comunidade.",
    robots: { index: false, follow: false },
    // Installed on iPhone (Add to Home Screen): opens full screen with this name.
    appleWebApp: { capable: true, title: "CadênciaFit", statusBarStyle: "black" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page dynamic, which the per-request CSP nonce requires.
  await headers();
  // Theme is applied on the server: no flash of the wrong theme and no inline script (CSP).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" className={[sora.variable, themeClass(theme)].filter(Boolean).join(" ")}>
      <body className="min-h-dvh">
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
