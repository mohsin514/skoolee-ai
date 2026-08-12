export const ACADEMIC_CYCLE_CHANGED = "academic-cycle-changed";

export function emitCycleChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACADEMIC_CYCLE_CHANGED));
  }
}
