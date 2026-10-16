import { createContext, useContext, useState, type ReactNode } from "react";

export const CHILD_NAME = "Same pupil name طفل ایک جیسا";
export const LONG_ROLL_A = "INTERNATIONAL-SCHOOL-2026-ACADEMIC-RECORD-00000000000000000000000000000001";
export const LONG_ROLL_B = "INTERNATIONAL-SCHOOL-2026-ACADEMIC-RECORD-00000000000000000000000000000002";
const siblings = [
  { id: "child-a", fullName: CHILD_NAME, rollNo: LONG_ROLL_A, className: "Grade 5 — North Campus", campusName: "North Campus" },
  { id: "child-b", fullName: CHILD_NAME, rollNo: LONG_ROLL_B, className: "Grade 5 — South Campus", campusName: "South Campus" },
];
const Family = createContext({ selected: "child-a", select: (_id: string) => {} });
export function FixtureData({ children }: { children: ReactNode }) {
  const [selected, select] = useState("child-a");
  return <Family.Provider value={{ selected, select }}>{children}</Family.Provider>;
}
export function useParentData() {
  const { selected, select } = useContext(Family);
  return { data: { student: siblings.find(item => item.id === selected)!, campus: { name: "International School", school: {} }, access: { learningRecords: true, attendance: true, finances: true }, navigationAccess: { reports: true, attendance: true, fees: true, timetable: true } }, children: siblings, selectedStudentId: selected, selectChild: select, loading: false, token: null, error: null, refetch() {} };
}
export function useStudentData() { return { data: { user: { fullName: CHILD_NAME, className: "Grade 5 — International School" }, logoUrl: null }, loading: false, error: null, refetch() {} }; }
