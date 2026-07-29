import { TeacherShell } from "./teacher-shell";
import { TeacherDataProvider } from "./teacher-data-context";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <TeacherDataProvider>
      <TeacherShell>{children}</TeacherShell>
    </TeacherDataProvider>
  );
}
