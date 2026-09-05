import { describe, it, expect } from "vitest";
import { appMetadata, appViewport, THEME_COLOR } from "./app-metadata";

describe("app metadata", () => {
  it("points at the manifest route Next generates from src/app/manifest.ts", () => {
    expect(appMetadata.manifest).toBe("/manifest.webmanifest");
  });

  it("declares the iOS home-screen fields that make an install look like an app", () => {
    // `capable` is what drops Safari's browser chrome once the icon is tapped.
    expect(appMetadata.appleWebApp).toMatchObject({
      capable: true,
      title: "Smart Lists",
      statusBarStyle: "default",
    });
  });

  it("declares the apple-touch-icon the icon guard pins", () => {
    expect(JSON.stringify(appMetadata.icons)).toContain("/apple-touch-icon.png");
  });

  it("keeps viewport-fit cover so the safe-area tokens report real values", () => {
    expect(appViewport.viewportFit).toBe("cover");
    expect(appViewport.themeColor).toBe(THEME_COLOR);
  });

  it("never blocks pinch zoom", () => {
    // Locking the scale is an accessibility failure, and iOS ignores it anyway.
    expect(appViewport.maximumScale).toBeUndefined();
    expect(appViewport.userScalable).toBeUndefined();
  });
});
