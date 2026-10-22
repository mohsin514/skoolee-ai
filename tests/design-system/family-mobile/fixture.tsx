import { createRoot } from "react-dom/client";
import { BookOpen } from "lucide-react";
import { ParentShell } from "../../../src/app/parent/parent-shell";
import { StudentShell } from "../../../src/app/student/student-shell";
import { ParentPage } from "../../../src/components/parent/parent-page";
import { StudentPage } from "../../../src/components/student/student-page";
import { StaticLocaleProvider } from "../../../src/components/locale/LocaleProvider";
import { defaultLocale } from "../../../src/lib/locale/package";
import { Button } from "../../../src/components/ui/button";
import { CHILD_NAME, FixtureData, LONG_ROLL_A, useParentData } from "./data-mock";

const role = location.pathname.startsWith("/student") ? "student" : "parent";
const language = document.documentElement.lang as "en" | "ar" | "ur";
function Content() {
  return <div className="space-y-4">
    <article data-testid="primary-record" className="rounded-xl border p-3"><h2 className="text-lg font-bold">Current learner record</h2><p className="text-sm">Published information for the selected learner. This content must remain readable and reachable with enlarged text.</p></article>
    {Array.from({ length: 6 }, (_, index) => <article key={index} className="rounded-xl border p-3"><h2 className="font-bold">Published record {index + 1}</h2><p className="text-sm">A clear record with readable text and an action that remains accessible above the fixed mobile navigation.</p></article>)}
    <Button data-testid="final-action" onClick={event => event.currentTarget.dataset.activated = "true"}>Open final record</Button>
  </div>;
}
function ParentFixture() {
  const { data, selectedStudentId } = useParentData();
  // ParentPage/StudentPage are thin PageHeader wrappers now (role-ux §4.3): one title, one description.
  return <ParentShell><ParentPage icon={BookOpen} title={data.student.fullName} description={`${data.student.rollNo} — ${data.student.className}`}><output data-testid="selected-child">{selectedStudentId}</output><Content /></ParentPage></ParentShell>;
}
function StudentFixture() {
  return <StudentShell><StudentPage icon={BookOpen} title={CHILD_NAME} description={`${LONG_ROLL_A} — Grade 5 — International School`}><Content /></StudentPage></StudentShell>;
}
createRoot(document.getElementById("root")!).render(<StaticLocaleProvider value={{ ...defaultLocale, language }}><FixtureData>{role === "parent" ? <ParentFixture /> : <StudentFixture />}</FixtureData></StaticLocaleProvider>);
