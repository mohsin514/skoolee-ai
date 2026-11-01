/**
 * SKAI-1464: a fee summary (balance and name) belongs to the child it was loaded for. A header must only use it
 * while that child is still the selected one, so a sibling's balance is never paired with another child's name.
 * Switching child makes the previous balance disappear on the same render, without waiting for a load.
 */
export function summaryForChild<T extends { studentId: string }>(summary: T | null, selectedStudentId: string | null | undefined): T | null {
  return summary && summary.studentId === (selectedStudentId ?? "") ? summary : null;
}
