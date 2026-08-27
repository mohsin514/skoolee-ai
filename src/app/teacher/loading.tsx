import { TeacherRouteSkeleton } from "@/components/teacher/teacher-components";

// Rendered inside TeacherShell, so the sidebar and top bar stay put and only
// the page card is standing in. A skeleton of that card beats the spinner
// this used to show, which read as the console losing its page mid-click.
export default function TeacherLoading() {
  return <TeacherRouteSkeleton />;
}
