import { redirect } from "next/navigation";

/**
 * "Schedule" was a second attendance page: same history list, same stats, but
 * a name that promised a timetable. Its genuinely unique panels (current class
 * and profile) moved to Coursework, and attendance lives on /student/attendance
 * — which also has the monthly calendar this page never had. Old links and
 * bookmarks land there rather than 404.
 */
export default function StudentSchedulePage() {
  redirect("/student/attendance");
}
