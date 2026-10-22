"use client";
import { useLocale } from "@/components/locale/LocaleProvider";
import { ExamPlayer } from "./exam-player";
import { ExamReviewDesk } from "./exam-review";
import { ExamWorkspace } from "./exam-workspace";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { examCopy } from "./exam-copy";

export function ExamPageClient({ id, student, framed = false }: { id?: string; student: boolean; framed?: boolean }) {
  const { language } = useLocale();
  const back = language === "ar" ? "العودة إلى الاختبارات" : language === "ur" ? "امتحانات پر واپس جائیں" : "Back to exams";
  const Container = framed ? "div" : "main";
  return <Container className={framed ? "min-w-0" : "mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:py-10"}>
    {!student && <div className="mb-5"><Link href={id ? "/ai/exams" : "/ai"} className={buttonVariants({ variant: "outline" })}>{id ? back : "School AI"}</Link></div>}
    {student && !id && !framed && <div className="mb-5"><Link href="/student" className={buttonVariants({ variant: "outline" })}>{examCopy(language).studentHome}</Link></div>}
    {!id ? <ExamWorkspace locale={language} student={student} headingLevel={framed ? 1 : 2} /> : student ? <ExamPlayer id={id} locale={language} /> : <ExamReviewDesk id={id} locale={language} />}
  </Container>;
}
