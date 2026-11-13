// SKAI-1390: the slot editor always offers the saved teacher/room, even when availability failed or omits them.
export function withCurrentOption<T extends { id: string }>(
  free: T[],
  currentId: string | null | undefined,
  all: T[],
  fallback: (id: string) => T,
): T[] {
  if (!currentId || free.some((o) => o.id === currentId)) return free;
  return [all.find((o) => o.id === currentId) ?? fallback(currentId), ...free];
}
