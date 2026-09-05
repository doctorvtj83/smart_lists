import { describe, it, expect } from "vitest";
import manifest from "./manifest";
import { THEME_COLOR } from "@/lib/pwa/app-metadata";

/**
 * The manifest is what turns the site into an installable app. Every field here
 * is load-bearing for the install prompt, so each one is pinned rather than
 * spot-checked: a missing `display` or a mismatched icon size silently downgrades
 * the install to a plain bookmark, with no error anywhere.
 */
describe("web app manifest", () => {
  const result = manifest();

  it("identifies the app in German", () => {
    expect(result.name).toBe("Smart Lists");
    expect(result.short_name).toBe("Smart Lists");
    expect(result.lang).toBe("de");
  });

  it("launches standalone from the app root", () => {
    expect(result.start_url).toBe("/");
    expect(result.scope).toBe("/");
    expect(result.display).toBe("standalone");
  });

  it("uses the one theme colour the viewport also declares", () => {
    expect(result.theme_color).toBe(THEME_COLOR);
    expect(result.background_color).toBe(THEME_COLOR);
  });

  it("ships the icons the size guard pins, including a maskable one", () => {
    const icons = result.icons ?? [];
    expect(icons.map((icon) => icon.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
    ]);
    // Android crops a maskable icon; without one it draws a white box behind ours.
    expect(icons.find((icon) => icon.purpose === "maskable")?.sizes).toBe("512x512");
  });
});
