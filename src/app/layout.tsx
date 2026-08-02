import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Smart Lists",
  description: "Gemeinsame Listen für Haushalt, Einkauf und Reisen.",
};

// viewportFit: "cover" is what makes env(safe-area-inset-*) report real values
// on an iPhone — without it the safe-area tokens in globals.css are always 0.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fcfcfb",
};

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
