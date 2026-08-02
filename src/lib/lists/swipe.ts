/**
 * The geometry of swipe-to-delete (handoff §10).
 *
 * Why the numbers live here instead of inside the row component: they are the
 * only part of the gesture that has a right and a wrong answer, and jsdom is a
 * poor place to argue about pixels. The component keeps the pointer plumbing;
 * this module keeps the decisions, unit-tested in the node environment.
 */

/** Release further left than this deletes the row. Verbatim from the prototype. */
export const SWIPE_DELETE_THRESHOLD_PX = -80;

/**
 * Below this much movement the gesture is still a tap. Without the tolerance the
 * tiny drift of a finger tap would arm the swipe and swallow the tap that opens
 * the entry sheet.
 */
export const SWIPE_START_TOLERANCE_PX = 5;

/**
 * How far the row should be translated, given where the pointer went down and
 * where it is now. Clamped at 0 because this design has no right-swipe action —
 * an unclamped value would drag the row off its own delete surface.
 */
export function swipeOffset(startX: number, currentX: number): number {
  return Math.min(0, currentX - startX);
}

/** Has the pointer moved far enough that this is a drag rather than a tap? */
export function isSwipeStarted(offset: number): boolean {
  return Math.abs(offset) > SWIPE_START_TOLERANCE_PX;
}

/**
 * On release: delete, or snap back? Strictly past the threshold, so a release
 * exactly at −80px is a snap-back. The asymmetry is on purpose: the destructive
 * outcome is the one that cannot be undone, so the boundary belongs to the safe
 * side.
 */
export function shouldDeleteOnRelease(offset: number): boolean {
  return offset < SWIPE_DELETE_THRESHOLD_PX;
}
