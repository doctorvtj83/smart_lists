import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Pins the PWA icon set: the files must exist, be exactly the sizes the manifest
 * claims, AND carry the right alpha channel. A manifest that promises 512×512
 * and ships a 400×400 file is rejected silently by the install prompt on some
 * browsers, so "the file is there" is not enough.
 *
 * The colour-type assertion is the one that catches the expensive mistake. A
 * transparent apple-touch-icon looks fine everywhere except an actual iPhone
 * home screen, where iOS composites the transparency onto black — and a
 * transparent maskable icon makes Android draw a white box behind the corners.
 * Neither shows up in any other test, in the build, or in a desktop browser.
 *
 * Why a hand-rolled PNG parser instead of an image library: a PNG's IHDR chunk
 * puts every field at a fixed byte offset, so a dozen lines of Buffer reads
 * replace a dependency. The meta plan locks the stack; this is not worth a devDep.
 */

// The 8 magic bytes every PNG starts with. Reading them first turns "someone
// committed a JPEG named .png" into a clear failure instead of a garbage size.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG colour types, from the spec. Only the two this project produces are named.
const COLOUR_TYPE_RGB = 2; // opaque, no alpha channel at all
const COLOUR_TYPE_RGBA = 6; // truecolour with alpha

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
}

/** Reads a PNG's IHDR chunk — the header every PNG must open with. */
function readPngHeader(relativePath: string): PngHeader {
  const buffer = readFileSync(resolve(process.cwd(), relativePath));
  // Bytes 0–7 signature, 8–11 chunk length, 12–15 chunk type ("IHDR"), then
  // width and height as big-endian uint32s at 16 and 20, bit depth at 24 and
  // colour type at 25.
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `${relativePath} is not a PNG`).toBe(true);
  expect(buffer.subarray(12, 16).toString("ascii"), `${relativePath} has no IHDR`).toBe("IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colourType: buffer[25],
  };
}

// The exact contract. src/app/manifest.ts and src/lib/pwa/app-metadata.ts
// reference these same paths; changing one without the other fails a test.
const EXPECTED_ICONS: Array<{ path: string; size: number; colourType: number }> = [
  // The two "any" icons draw their own rounded corners, so the area outside the
  // radius has to be transparent — hence RGBA.
  { path: "public/icons/icon-192.png", size: 192, colourType: COLOUR_TYPE_RGBA },
  { path: "public/icons/icon-512.png", size: 512, colourType: COLOUR_TYPE_RGBA },
  // Android crops this one itself; transparency would become a white box.
  { path: "public/icons/maskable-512.png", size: 512, colourType: COLOUR_TYPE_RGB },
  // iOS composites transparency onto black and applies its own corner mask.
  { path: "public/apple-touch-icon.png", size: 180, colourType: COLOUR_TYPE_RGB },
];

describe("PWA icons", () => {
  it.each(EXPECTED_ICONS)("$path is a square $size×$size 8-bit PNG", ({ path, size }) => {
    const header = readPngHeader(path);
    expect(header.width).toBe(size);
    expect(header.height).toBe(size);
    // 16-bit would double the file size for no visible gain at icon scale, and
    // a palette PNG (colour type 3) would make the alpha assertion below
    // meaningless, since palette transparency lives in a separate tRNS chunk.
    expect(header.bitDepth).toBe(8);
  });

  it.each(EXPECTED_ICONS)("$path has the alpha channel its platform needs", ({ path, colourType }) => {
    expect(readPngHeader(path).colourType).toBe(colourType);
  });
});
