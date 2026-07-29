import { StudentShell } from "./student-shell";
import { StudentDataProvider } from "./student-data-context";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentDataProvider>
      <StudentShell>{children}</StudentShell>
    </StudentDataProvider>
  );
}
