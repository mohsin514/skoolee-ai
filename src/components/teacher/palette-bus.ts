"use client";

/**
 * The open signal for the teacher command palette.
 *
 * It lives in its own module so the subnav can offer a visible "Jump to"
 * button without importing the palette — which imports TEACHER_NAV back out of
 * the subnav's file, and a cycle between the two is not worth the convenience.
 */
export const TEACHER_PALETTE_EVENT = "teacher:command-palette";

export function openTeacherPalette() {
  window.dispatchEvent(new Event(TEACHER_PALETTE_EVENT));
}
