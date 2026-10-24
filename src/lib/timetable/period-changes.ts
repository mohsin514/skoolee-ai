export interface PeriodConfiguration { period: number; start: string; end: string; type: string }
export interface PeriodAssignment {
  id: string; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; slotType: string;
  subjectId: string | null; teacherId: string | null; roomId: string | null; roomNumber: string | null;
  subject?: { name: string } | null; teacher?: { fullName: string } | null; room?: { roomNumber: string } | null;
}
export function planPeriodChanges<T extends PeriodAssignment>(slots: T[], periods: PeriodConfiguration[]) {
  const clearing: Array<{ slot: T; type: string }> = [];
  const updates = slots.map(slot => {
    const period = periods.find(value => value.period === slot.periodNumber);
    const type = period?.type || slot.slotType;
    const clear = type !== "CLASS";
    if (clear && (slot.subjectId || slot.teacherId || slot.roomId || slot.roomNumber)) clearing.push({ slot, type });
    return { id: slot.id, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, startTime: period?.start || slot.startTime, endTime: period?.end || slot.endTime, slotType: type, subjectId: clear ? null : slot.subjectId, teacherId: clear ? null : slot.teacherId, roomId: clear ? null : slot.roomId, roomNumber: clear ? null : slot.roomNumber };
  });
  return { updates, clearing };
}
