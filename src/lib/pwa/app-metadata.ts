import type { Metadata, Viewport } from "next";

/**
 * The root layout's metadata and viewport, extracted so they can be unit-tested.
 *
 * Why they do not live in layout.tsx any more: that file imports globals.css and
 * next/font/google, so a node-environment test cannot import it. These objects
 * ARE the installability contract of this slice, so they need a test. layout.tsx
 * re-exports them, which is all Next.js requires.
 */

/**
 * The browser/OS chrome colour. One constant because THREE places must agree:
 * the viewport export below, the web app manifest's `theme_color`, and the
 * --color-bg design token. A drift shows up as a coloured seam above the header
 * on an installed iPhone, which is exactly the kind of bug nobody files.
 */
export const THEME_COLOR = "#fcfcfb";

export const appMetadata: Metadata = {
  title: "Smart Lists",
  description: "Gemeinsame Listen für Haushalt, Einkauf und Reisen.",
  // applicationName is what Android's task switcher labels the installed app with.
  applicationName: "Smart Lists",
  // Next.js serves src/app/manifest.ts at this exact path — not /manifest.json.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // The single field that makes iOS launch the app without Safari's chrome.
    capable: true,
    // The name under the home-screen icon. Kept short so iOS does not truncate it.
    title: "Smart Lists",
    // "default" = dark text on a light bar, which is what a #fcfcfb app wants.
    statusBarStyle: "default",
  },
  icons: {
    // iOS ignores the manifest icons entirely and only reads this link tag.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const appViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewportFit: "cover" is what makes env(safe-area-inset-*) report real values
  // on an iPhone — without it the safe-area tokens in globals.css are always 0.
  viewportFit: "cover",
  themeColor: THEME_COLOR,
  // Deliberately NO maximumScale/userScalable: pinch zoom is an accessibility
  // requirement, and iOS Safari has ignored attempts to disable it since 10.
};
