import type { MetadataRoute } from "next";

/** Makes the site installable as an app (home screen icon, full screen, no browser bar). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SalesFit",
    short_name: "SalesFit",
    description: "Treinos, evolução e comunidade para personal trainers e alunos.",
    lang: "pt-BR",
    // Logged-in users land in their own area; others are sent to the login page.
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f5f2",
    theme_color: "#f2690f",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
