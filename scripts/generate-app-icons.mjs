/**
 * Renders the four PWA icons from the mark the app already has.
 *
 * WHY a script and not four committed binaries with no provenance: the mark is
 * the login screen's logo tile (src/app/login/page.module.css), and every number
 * below is that tile expressed as a ratio. Written down here, the icons stay
 * traceable to the design — if --color-accent ever changes, regenerating is one
 * command instead of a round-trip to whoever still has the source file.
 *
 * The PNGs it produces ARE committed: the build never runs this, and CI has no
 * ImageMagick. This is a maintenance tool, run by hand:
 *
 *   node scripts/generate-app-icons.mjs
 *
 * Requires ImageMagick 7 (`magick`) on PATH. It is a system tool, not an npm
 * dependency — the meta plan's locked stack is untouched.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// --- The mark, as ratios ---------------------------------------------------
// Sourced from src/app/login/page.module.css (64px tile, 18px radius) and
// src/app/login/page.tsx (30px Lucide `check`). Expressed as fractions of the
// canvas so one set of numbers serves every icon size.
const ACCENT = "#3e63c4"; // --color-accent
const ON_ACCENT = "#ffffff"; // --color-on-accent
const RADIUS_RATIO = 18 / 64; // 28.125% of the side
const GLYPH_RATIO = 30 / 64; // 46.875% of the side
const VIEWBOX = 24; // Lucide's coordinate space
const STROKE_UNITS = 1.75; // Icon.tsx uses this stroke for every glyph
// Lucide "check": path "M20 6 9 17l-5-5" — three points, two segments.
const CHECK_POINTS = [
  [20, 6],
  [9, 17],
  [4, 12],
];

/**
 * Renders one icon.
 *
 * `rounded` picks between the two shapes the platforms need: a tile with
 * transparent corners (the manifest's `purpose: "any"` icons, which are shown
 * as-is) and an opaque full-bleed square (maskable + apple-touch, both of which
 * are cropped by the OS and must not supply corners or alpha of their own).
 */
function render({ out, size, glyphRatio, rounded }) {
  const box = size * glyphRatio; // the 24-unit viewBox, scaled to this canvas
  const offset = (size - box) / 2; // centred on both axes
  const scale = box / VIEWBOX;
  const polyline = CHECK_POINTS.map(
    ([x, y]) => `${(offset + x * scale).toFixed(2)},${(offset + y * scale).toFixed(2)}`,
  ).join(" ");

  // colour type 6 = RGBA, 2 = RGB with no alpha channel. Pinned explicitly
  // because ImageMagick otherwise picks a palette PNG (type 3) for an image
  // this flat, and palette transparency lives in a tRNS chunk the icon guard
  // cannot see.
  const [background, tile, colourType] = rounded
    ? [
        "none",
        `roundrectangle 0,0 ${size - 1},${size - 1} ${(size * RADIUS_RATIO).toFixed(2)},${(size * RADIUS_RATIO).toFixed(2)}`,
        "6",
      ]
    : [ACCENT, `rectangle 0,0 ${size - 1},${size - 1}`, "2"];

  execFileSync("magick", [
    "-size", `${size}x${size}`, `xc:${background}`,
    "-fill", ACCENT, "-stroke", "none", "-draw", tile,
    // Stroke only, no fill: the check is a polyline, not a filled shape. Round
    // caps and joins are what make it read as the Lucide glyph rather than a
    // chevron with cut ends.
    "-fill", "none", "-stroke", ON_ACCENT,
    "-strokewidth", (STROKE_UNITS * scale).toFixed(3),
    "-draw", `stroke-linecap round stroke-linejoin round polyline ${polyline}`,
    "-colorspace", "sRGB", "-depth", "8",
    "-define", `png:color-type=${colourType}`, "-define", "png:bit-depth=8",
    out,
  ]);

  console.log(`wrote ${out}`);
}

mkdirSync("public/icons", { recursive: true });

render({ out: "public/icons/icon-192.png", size: 192, glyphRatio: GLYPH_RATIO, rounded: true });
render({ out: "public/icons/icon-512.png", size: 512, glyphRatio: GLYPH_RATIO, rounded: true });
// 40% rather than 46.875%: Android crops this file to the launcher's shape,
// which makes the artwork appear zoomed, and the glyph has to stay inside the
// maskable safe zone (the centred circle covering the middle 80%).
render({ out: "public/icons/maskable-512.png", size: 512, glyphRatio: 0.4, rounded: false });
render({ out: "public/apple-touch-icon.png", size: 180, glyphRatio: GLYPH_RATIO, rounded: false });
