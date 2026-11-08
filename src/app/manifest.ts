import type { MetadataRoute } from "next";

/** Makes the site installable as an app (home screen icon, full screen, no browser bar). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CadênciaFit",
    short_name: "CadênciaFit",
    description: "Treinos, evolução e comunidade para personal trainers e alunos.",
    lang: "pt-BR",
    // Logged-in users land in their own area; others are sent to the login page.
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0f11",
    theme_color: "#0f0f11",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
