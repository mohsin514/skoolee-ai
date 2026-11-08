"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/tooltip";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, DeskStats, StatTile, urgencyFirst } from "@/components/ui/desk";
import { BookOpen, CalendarCheck, Download, FileText, GraduationCap, MoreHorizontal, PenLine, School, SearchX, Star, Users } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import {
  classLabel, DashboardSkeleton, TeacherErrorState,
} from "@/components/teacher/teacher-components";
import { cn } from "@/lib/utils";
import { csvCell } from "@/lib/csv";
import { useTeacherData } from "../teacher-data-context";

export default function TeacherClassesPage() {
  const ui = useUiText();
  const router = useRouter();
  const { data, loading, error, refetch } = useTeacherData();
  // The Pending marks tile narrows the grid to the classes with marks still to enter; those classes lead.
  const [pendingOnly, setPendingOnly] = useState(false);
  const [query, setQuery] = useState("");
  const classHubs: any[] = useMemo(() => data?.classHubs || [], [data]);
  const studentsIn = (classId: string) => (data?.students || []).filter((s: any) => s.class?.id === classId);
  const pendingMarksIn = (classId: string): number => (data?.activeExams || [])
    .filter((e: any) => e.classId === classId)
    .reduce((sum: number, e: any) => sum + (e.missingMarks || 0), 0);
  const shownClasses = useMemo(() => {
    const pending = (classId: string): number => (data?.activeExams || []).filter((e: any) => e.classId === classId).reduce((sum: number, e: any) => sum + (e.missingMarks || 0), 0);
    const q = query.trim().toLowerCase();
    const list = classHubs.filter((cls) => (!pendingOnly || pending(cls.id) > 0)
      && (!q || `${classLabel(cls) || ""} ${(cls.subjects || []).map((subject: any) => subject.name).join(" ")}`.toLowerCase().includes(q)));
    return urgencyFirst(list, (cls) => (pending(cls.id) > 0 ? 0 : 1));
  }, [classHubs, data, pendingOnly, query]);

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <TeacherErrorState error={error} onRetry={refetch} />;

  const classesWithPending = classHubs.filter((cls) => pendingMarksIn(cls.id) > 0).length;
  const pendingTotal = classHubs.reduce((sum: number, cls: any) => sum + pendingMarksIn(cls.id), 0);
  const subjectTotal = new Set(classHubs.flatMap((cls: any) => (cls.subjects || []).map((subject: any) => subject.name))).size;

  /* §4.4b teacher · Classes: Export is the screen's one visible secondary (UTF-8 BOM so Arabic and
     Urdu names open correctly in spreadsheet apps). */
  const exportCsv = () => {
    const rows = [[ui("Class"), ui("Your role"), ui("Students"), ui("Subjects"), ui("Pending marks")]];
    for (const cls of classHubs) {
      rows.push([
        classLabel(cls) || "",
        ui(cls.role || "Teacher"),
        String(studentsIn(cls.id).length),
        (cls.subjects || []).map((subject: any) => subject.name).join("; "),
        String(pendingMarksIn(cls.id)),
      ]);
    }
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "my-classes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TeacherPage
      icon={School}
      title="Classes"
      description="Every class assigned to you, with its pupils, subjects and marks still to enter."
      secondaryActions={classHubs.length ? [{ id: "export", label: "Export", icon: Download, onClick: exportCsv }] : []}
    >
      <div className="space-y-3">
        {classHubs.length === 0 ? (
          <div className="sk-panel sk-enter">
            <EmptyState
              icon={GraduationCap}
              title={ui("No classes assigned yet")}
              description={ui("Your classes appear here as soon as a school administrator assigns them to you. If you expected to see a class, ask your administrator to check your teaching assignments.")}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <DeskStats>
              <StatTile index={0} icon={GraduationCap} tone="brand" label={ui("Classes")} value={<bdi>{classHubs.length}</bdi>} />
              <StatTile index={1} icon={Users} tone="info" label={ui("Students")} value={<bdi>{(data.students || []).length}</bdi>} />
              <StatTile index={2} icon={BookOpen} tone="neutral" label={ui("Subjects")} value={<bdi>{subjectTotal}</bdi>} />
              <StatTile index={3} icon={PenLine} tone={pendingTotal > 0 ? "warning" : "success"} label={ui("Pending marks")} value={<bdi>{pendingTotal}</bdi>}
                onSelect={classesWithPending ? () => setPendingOnly((value) => !value) : undefined} selected={pendingOnly} />
            </DeskStats>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink-strong">{ui("Assigned classes")}</h2>
              <Badge variant="neutral" size="sm" data-numeric>{ui("{0} active", [classHubs.length])}</Badge>
            </div>
            {classHubs.length > 8 ? <DeskQuickFilter value={query} onChange={setQuery} label={ui("Filter this list")} /> : null}
            <DeskFilterStatus shown={shownClasses.length} total={classHubs.length} onClear={() => { setPendingOnly(false); setQuery(""); }} />
            {shownClasses.length === 0 ? (
              <div className="sk-panel"><EmptyState size="sm" icon={SearchX} title={ui("No classes match these filters.")} /></div>
            ) : null}
            <div className="sk-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shownClasses.map((cls: any) => {
                const clsStudents = studentsIn(cls.id);
                const clsMissingMarks = pendingMarksIn(cls.id);
                return (
                  <div key={cls.id} data-tone={clsMissingMarks > 0 ? "warning" : undefined} className="sk-panel sk-hover-lift group min-w-0 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-primary">{ui(cls.role || "Teacher")}{clsMissingMarks > 0 ? <DeskPill tone="warning">{ui("Pending marks")}</DeskPill> : null}</p>
                        <h3 className="mt-0.5 truncate text-base font-bold tracking-tight text-ink-strong transition-colors group-hover:text-primary">{classLabel(cls)}</h3>
                      </div>
                      <div aria-hidden="true" className="sk-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-1.5">
                      <div className="rounded-xl bg-brand-50/70 px-2 py-1.5 text-center">
                        <p className="text-base font-bold tabular-nums text-primary"><bdi>{clsStudents.length}</bdi></p>
                        <p className="truncate text-2xs font-semibold text-ink-subtle">{ui("Students")}</p>
                      </div>
                      <div className="rounded-xl bg-brand-50/70 px-2 py-1.5 text-center">
                        <p className="text-base font-bold tabular-nums text-ink-strong"><bdi>{cls.subjects?.length || 0}</bdi></p>
                        <p className="truncate text-2xs font-semibold text-ink-subtle">{ui("Subjects")}</p>
                      </div>
                      <div className="rounded-xl bg-brand-50/70 px-2 py-1.5 text-center">
                        <p className={cn("text-base font-bold tabular-nums", clsMissingMarks > 0 ? "text-status-error-text" : "text-status-success-text")}><bdi>{clsMissingMarks}</bdi></p>
                        <p className="inline-flex max-w-full items-center justify-center gap-0.5 text-2xs font-semibold text-ink-subtle">
                          <span className="truncate">{ui("Pending")}</span>
                          <InfoTip label={ui("About pending marks")} content={ui("Marks not yet entered for this class's active assessments, added up across every assessment.")} />
                        </p>
                      </div>
                    </div>
                    {(cls.subjects?.length || 0) > 0 ? (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {(cls.subjects || []).slice(0, 4).map((subject: any) => (
                          <Badge key={subject.id} variant="secondary" size="sm" className="max-w-[12rem]"><span className="truncate">{subject.name}</span></Badge>
                        ))}
                        {(cls.subjects?.length || 0) > 4 && (
                          <Badge variant="neutral" size="sm" data-numeric>+{cls.subjects.length - 4}</Badge>
                        )}
                      </div>
                    ) : null}
                    {/* Each action carries this class through. They used to
                        link to the bare page, so tapping "Attendance" on Grade
                        5A landed on whichever class sorted first and the
                        teacher had to pick 5A again. */}
                    <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
                      <Button size="sm" variant="outline" type="button" className="flex-1"
                        onClick={() => router.push(`/teacher/attendance?classId=${encodeURIComponent(cls.id)}`)}>
                        <CalendarCheck aria-hidden="true" />
                        {ui("Take register")}
                      </Button>
                      <Menu
                        label={ui("More actions")}
                        align="end"
                        trigger={<IconButton size="sm" variant="ghost" label={ui("More actions for {0}", [classLabel(cls)])}><MoreHorizontal aria-hidden="true" /></IconButton>}
                        items={[
                          { id: "marks", label: "Marks", icon: Star, onSelect: () => router.push(`/teacher/marks?classId=${encodeURIComponent(cls.id)}`) },
                          { id: "reports", label: "Report cards", icon: FileText, onSelect: () => router.push(`/teacher/reports?classId=${encodeURIComponent(cls.id)}`) },
                          { id: "students", label: "Students", icon: Users, onSelect: () => router.push(`/teacher/students?classId=${encodeURIComponent(cls.id)}`) },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TeacherPage>
  );
}
