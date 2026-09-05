import { Figtree } from "next/font/google";
import { appMetadata, appViewport } from "@/lib/pwa/app-metadata";
import "./globals.css";

// next/font self-hosts the font at build time (no request to Google at runtime)
// and exposes it as a CSS variable, which globals.css consumes in `body`.
// Weights 400–800 are exactly the range the design uses.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Re-exported, not defined here: Next.js only requires the named exports to
// exist on the layout module. The objects live in src/lib/pwa/app-metadata.ts so
// a test can import them without pulling in globals.css and next/font.
export const metadata = appMetadata;
export const viewport = appViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // lang="de" — the product's user-facing language, which also drives hyphenation
  // and screen-reader pronunciation.
  return (
    <html lang="de" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
