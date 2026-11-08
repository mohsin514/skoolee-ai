/**
 * The auth mascot's mind, kept pure so it can be tested without a browser.
 *
 * The live face (`AuthMascot`) watches focus, Caps Lock and page signals,
 * reduces them to a `MascotState`, and asks `resolveMood` which single pose to
 * show. CSS owns what each pose looks like; this file only decides which one.
 * No class names live here.
 */

export type MascotMood = "idle" | "attentive" | "shy" | "peek" | "wide" | "concerned" | "waiting" | "thinking" | "happy" | "celebrate";
export type MascotFocus = "none" | "field" | "secret" | "secret-revealed" | "control";
export type MascotState = {
  focus: MascotFocus; capsLock: boolean; error: boolean; success: boolean;
  waiting: boolean; thinking: boolean; celebrate: boolean;
};

const isSecret = (focus: MascotFocus) => focus === "secret" || focus === "secret-revealed";

/** Priority: celebrate > success(happy) > waiting > error(concerned) > capsLock(wide)
 *  > secret-revealed(peek) > secret(shy) > thinking > field|control(attentive) > idle
 *
 *  Caps Lock only widens the eyes while a password field has focus: that is the
 *  only place the page states it in words (the Caps Lock hint), and the mascot
 *  never shows a state the text does not. */
export function resolveMood(s: MascotState): MascotMood {
  if (s.celebrate) return "celebrate";
  if (s.success) return "happy";
  if (s.waiting) return "waiting";
  if (s.error) return "concerned";
  if (s.capsLock && isSecret(s.focus)) return "wide";
  if (s.focus === "secret-revealed") return "peek";
  if (s.focus === "secret") return "shy";
  if (s.thinking) return "thinking";
  if (s.focus === "field" || s.focus === "control") return "attentive";
  return "idle";
}

/** Fixed gazes in unit space (-1..1, physical screen axes, +y = down). */
export const FIXED_GAZE: Partial<Record<MascotMood, { x: number; y: number }>> = {
  idle: { x: 0, y: 0 },
  shy: { x: 0, y: 0 },
  // Looks UP, away from the password, when Caps Lock surprises it.
  wide: { x: 0, y: -0.8 },
  // Up and towards the line start: "let me think". AuthMascot mirrors x in RTL.
  thinking: { x: -0.6, y: -0.7 },
  happy: { x: 0, y: -0.2 },
  celebrate: { x: 0, y: -0.2 },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Where the caret sits along a text field, 0 (start) to 1 (end).
 *  Email inputs report `null` for selectionStart, so the end of the text is used. */
export function caretRatio(pos: number | null, length: number): number {
  const safeLength = Number.isFinite(length) && length > 0 ? length : 0;
  const caret = pos ?? safeLength;
  return clamp(caret / Math.max(24, safeLength), 0, 1);
}

/** Unit gaze from `from` towards `to`. Within `reach` px the eyes move
 *  proportionally; beyond it they are at full deflection in that direction. */
export function gazeVector(from: { x: number; y: number }, to: { x: number; y: number }, reach = 240): { x: number; y: number } {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const length = Math.hypot(vx, vy);
  const scale = Math.max(length, reach > 0 ? reach : 1);
  const x = clamp(vx / scale, -1, 1);
  const y = clamp(vy / scale, -1, 1);
  // Normalise -0 so callers can compare with toEqual / Object.is.
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}
