import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/pwa/app-metadata";

/**
 * The web app manifest, served by Next.js at /manifest.webmanifest.
 *
 * Pattern: App Router file convention. A `manifest.ts` with a default export
 * beats a static public/manifest.json because it is TypeScript-checked against
 * MetadataRoute.Manifest and can import THEME_COLOR — so the manifest and the
 * viewport meta tag cannot drift apart.
 *
 * Note on middleware: the generated path contains a dot, so the auth matcher's
 * `.*\..*` exclusion already lets it through unauthenticated. That matters —
 * a browser fetches the manifest before the user has any session.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable `id` keeps an installed app pointing at the same entry when
    // start_url ever changes; without it the OS treats it as a second app.
    id: "/",
    name: "Smart Lists",
    short_name: "Smart Lists",
    description: "Gemeinsame Listen für Haushalt, Einkauf und Reisen.",
    lang: "de",
    dir: "ltr",
    // "/" and not "/projects": an unauthenticated launch has to reach the login
    // redirect, and a signed-in launch lands on Home with the "Weitermachen" card.
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The product is a one-hand phone app; a rotated shopping list helps nobody.
    orientation: "portrait",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separate file, not the same one re-declared: a maskable icon needs its
      // glyph inside the middle 80% because Android crops it to the OS shape.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
