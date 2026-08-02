import { describe, it, expect } from "vitest";
import {
  SWIPE_DELETE_THRESHOLD_PX,
  isSwipeStarted,
  shouldDeleteOnRelease,
  swipeOffset,
} from "./swipe";

describe("swipeOffset", () => {
  it("is negative when the finger moves left", () => {
    expect(swipeOffset(200, 140)).toBe(-60);
  });

  // Right-swipe is not a gesture in this design, so the row must not follow the
  // finger to the right at all — clamping is what keeps the delete surface hidden.
  it("clamps a rightward move to zero", () => {
    expect(swipeOffset(200, 260)).toBe(0);
  });

  it("is zero when the finger has not moved", () => {
    expect(swipeOffset(200, 200)).toBe(0);
  });
});

describe("isSwipeStarted", () => {
  it("ignores the jitter of a tap", () => {
    expect(isSwipeStarted(-3)).toBe(false);
    expect(isSwipeStarted(0)).toBe(false);
  });

  it("recognises a deliberate drag", () => {
    expect(isSwipeStarted(-12)).toBe(true);
  });
});

describe("shouldDeleteOnRelease", () => {
  it("deletes past the threshold", () => {
    expect(shouldDeleteOnRelease(-81)).toBe(true);
  });

  // Exactly at the threshold must snap back: the boundary belongs to the safe
  // side, because the destructive outcome is the irreversible one.
  it("snaps back at and above the threshold", () => {
    expect(shouldDeleteOnRelease(SWIPE_DELETE_THRESHOLD_PX)).toBe(false);
    expect(shouldDeleteOnRelease(-40)).toBe(false);
    expect(shouldDeleteOnRelease(0)).toBe(false);
  });
});
