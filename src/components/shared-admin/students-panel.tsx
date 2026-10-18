"use client";

import { Button as SystemButton } from "@/components/ui/button";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  ArrowRightLeft,
  Download,
  GraduationCap,
  LayoutGrid,
  Mail,
  MessageCircle,
  PhoneCall,
  Plus,
  RotateCcw,
  School,
  Table2,
  Tag,
  TriangleAlert,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { AvatarImage } from "@/components/ui/avatar-image";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Tooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  DataTable,
  Pagination,
  SearchField,
  SelectionBar,
  SortDirButton,
  StatTiles,
  ToolbarSelect,
  ToolbarToggle,
  ViewSwitch,
  WorkspaceHeader,
  WorkspaceToolbar,
  usePaged,
  useWorkspacePrefs,
  type BulkAction,
  type DataColumn,
  type StatTileSpec,
} from "@/components/shared-admin/workspace";
import {
  EmptyInline,
  StatusPill,
  classGroupKey,
  classLabel,
  groupClasses,
} from "@/components/shared-admin";
import { Checkbox as SystemCheckbox } from "@/components/ui/checkbox";
import { Select as SystemSelect } from "@/components/ui/select";

/* ────────────────────────── Sorting ────────────────────────── */

const SORTS: Record<string, { label: string; compare: (a: Student, b: Student) => number }> = {
  name: { label: "Name", compare: (a, b) => (a.fullName || "").localeCompare(b.fullName || "") },
  roll: {
    label: "Roll number",
    compare: (a, b) => (a.rollNo || "").localeCompare(b.rollNo || "", undefined, { numeric: true }),
  },
  newest: {
    label: "Recently added",
    compare: (a, b) =>
      new Date(b.enrollmentDate || b.createdAt || 0).getTime() -
      new Date(a.enrollmentDate || a.createdAt || 0).getTime(),
  },
  classOrder: {
    label: "Class, then roll",
    compare: (a, b) =>
      classLabel(a.class).localeCompare(classLabel(b.class), undefined, { numeric: true }) ||
      (a.rollNo || "").localeCompare(b.rollNo || "", undefined, { numeric: true }),
  },
  guardian: {
    label: "Guardian",
    compare: (a, b) => (a.guardianName || "").localeCompare(b.guardianName || ""),
  },
};

interface Student {
  id: string;
  fullName?: string;
  admissionNo?: string | null;
  rollNo?: string;
  profileImageUrl?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianWhatsapp?: string | null;
  guardianEmail?: string | null;
  enrollmentDate?: string;
  createdAt?: string;
  status?: string;
  class?: { id?: string; name?: string; section?: string | null } | null;
  category?: { id: string; name: string } | null;
  group?: { id: string; name: string } | null;
  studentUser?: { email?: string } | null;
  reportCards?: { status: string }[];
}
interface TagOption {
  id: string;
  name: string;
}

/** Phone numbers are stored as typed; strip everything a tel: link can't use. */
function telHref(phone?: string | null) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length >= 6 ? `tel:${cleaned}` : null;
}

function waHref(phone?: string | null) {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 8 ? `https://wa.me/${cleaned}` : null;
}

export function StudentsPanel({
  students,
  classes,
  onAddStudent,
  onViewStudent,
  onBulkImport,
  onExport,
  onRefresh,
  incomingFilter,
  onIncomingFilterApplied,
}: {
  students: Student[];
  classes: { id: string; name?: string; section?: string | null }[];
  onAddStudent: (classId?: string) => void;
  /** Receives the student and the list currently on screen, so the profile
   *  dialog can step through exactly what the admin is looking at. */
  onViewStudent: (student: Student, visible?: Student[]) => void;
  onBulkImport?: () => void;
  /** Receives exactly what the admin is looking at, not the whole roster. */
  onExport?: (visible: Student[]) => void;
  /** Called after a bulk change so the roster reloads. */
  onRefresh?: () => void | Promise<unknown>;
  /** A filter handed in from elsewhere — e.g. "show me this category". */
  incomingFilter?: { categoryId?: string; groupId?: string } | null;
  onIncomingFilterApplied?: () => void;
}) {
  const [prefs, patchPrefs] = useWorkspacePrefs("students", {
    view: "cards",
    sortKey: "name",
    perPage: 12,
  });

  // SKO-401: the directory's filters, search and page live in the URL, so Back, refresh and a link from
  // record search land on the same view. Read once on mount; written back on every change.
  const initial = useMemo(() => {
    const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    return { q: params.get("sq") ?? "", cls: params.get("sclass") ?? "all", section: params.get("class") ?? params.get("ssection") ?? "all", category: params.get("scat") ?? "all", group: params.get("sgroup") ?? "all", missing: params.get("smissing") === "1", nologin: params.get("snologin") === "1", page: Number(params.get("spage") ?? "1") || 1 };
  }, []);
  const [classFilter, setClassFilter] = useState(initial.cls);
  const [sectionFilter, setSectionFilter] = useState(initial.section);
  const [categoryFilter, setCategoryFilter] = useState(initial.category);
  const [groupFilter, setGroupFilter] = useState(initial.group);
  const [searchQuery, setSearchQuery] = useState(initial.q);
  const [onlyMissingGuardian, setOnlyMissingGuardian] = useState(initial.missing);
  const [onlyNoLogin, setOnlyNoLogin] = useState(initial.nologin);
  const pendingPage = useRef(initial.page > 1 ? initial.page : 0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkTag, setBulkTag] = useState<{ kind: "category" | "group" } | null>(null);
  const [bulkMove, setBulkMove] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<"archived" | "active" | null>(null);

  // The full tag lists, not just the ones already in use — otherwise the first
  // student to get a category could never be given one from here.
  const [allCategories, setAllCategories] = useState<TagOption[]>([]);
  const [allGroups, setAllGroups] = useState<TagOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, grps] = await Promise.all([
          fetch("/api/student-categories").then((r) => r.json()),
          fetch("/api/student-groups").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setAllCategories(cats.success ? cats.data : []);
        setAllGroups(grps.success ? grps.data : []);
      } catch {
        /* the roster still works without them; the bulk menu just stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const classGroups = useMemo(() => groupClasses(classes), [classes]);
  const selectedGroup = classGroups.find((g) => g.key === classFilter);

  const { categoryOptions, groupOptions } = useMemo(() => {
    const cats = new Map<string, string>();
    const grps = new Map<string, string>();
    for (const s of students) {
      if (s.category?.id) cats.set(s.category.id, s.category.name);
      if (s.group?.id) grps.set(s.group.id, s.group.name);
    }
    return {
      categoryOptions: [...cats.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      groupOptions: [...grps.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [students]);

  const missingGuardian = useMemo(
    () => students.filter((s) => !s.guardianPhone && !s.guardianEmail).length,
    [students],
  );
  const classesCovered = useMemo(
    () => new Set(students.map((s) => s.class?.id).filter(Boolean)).size,
    [students],
  );
  const noPortalLogin = useMemo(
    () => students.filter((s) => !s.studentUser?.email).length,
    [students],
  );
  const untagged = useMemo(() => students.filter((s) => !s.category?.id).length, [students]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = students.filter((student) => {
      if (sectionFilter !== "all" && student.class?.id !== sectionFilter) return false;
      if (sectionFilter === "all" && classFilter !== "all" && classGroupKey(student.class) !== classFilter)
        return false;
      if (categoryFilter === "none" && student.category?.id) return false;
      if (categoryFilter !== "all" && categoryFilter !== "none" && student.category?.id !== categoryFilter)
        return false;
      if (groupFilter === "none" && student.group?.id) return false;
      if (groupFilter !== "all" && groupFilter !== "none" && student.group?.id !== groupFilter) return false;
      if (onlyMissingGuardian && (student.guardianPhone || student.guardianEmail)) return false;
      if (onlyNoLogin && student.studentUser?.email) return false;
      if (!q) return true;
      return Boolean(
        student.id.toLowerCase().includes(q) ||
        student.admissionNo?.toLowerCase().includes(q) ||
        student.fullName?.toLowerCase().includes(q) ||
          student.rollNo?.toLowerCase().includes(q) ||
          student.guardianName?.toLowerCase().includes(q) ||
          student.guardianPhone?.includes(q) ||
          student.guardianEmail?.toLowerCase().includes(q),
      );
    });
    const compare = (SORTS[prefs.sortKey] ?? SORTS.name).compare;
    const dir = prefs.sortDir === "desc" ? -1 : 1;
    return result.sort((a, b) => compare(a, b) * dir);
  }, [
    students,
    classFilter,
    sectionFilter,
    categoryFilter,
    groupFilter,
    searchQuery,
    onlyMissingGuardian,
    onlyNoLogin,
    prefs.sortKey,
    prefs.sortDir,
  ]);

  const paged = usePaged(filtered, prefs.perPage);
  // The page from the URL is applied once the roster has loaded (paging resets when the row count changes).
  useEffect(() => {
    if (pendingPage.current && students.length && paged.totalPages >= pendingPage.current) { paged.setPage(pendingPage.current); pendingPage.current = 0; }
  }, [students.length, paged]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const set = (key: string, value: string | null) => { if (value) params.set(key, value); else params.delete(key); };
    set("sq", searchQuery.trim() || null); set("sclass", classFilter !== "all" ? classFilter : null); set("ssection", sectionFilter !== "all" ? sectionFilter : null);
    set("scat", categoryFilter !== "all" ? categoryFilter : null); set("sgroup", groupFilter !== "all" ? groupFilter : null);
    set("smissing", onlyMissingGuardian ? "1" : null); set("snologin", onlyNoLogin ? "1" : null); set("spage", paged.page > 1 && !pendingPage.current ? String(paged.page) : pendingPage.current ? String(pendingPage.current) : null);
    params.delete("class");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
  }, [searchQuery, classFilter, sectionFilter, categoryFilter, groupFilter, onlyMissingGuardian, onlyNoLogin, paged.page]);

  // Arriving from "show me the 12 students on Scholarship" should land on those
  // twelve, with the rest of the filters cleared so the count adds up.
  useEffect(() => {
    if (!incomingFilter) return;
    setClassFilter("all");
    setSectionFilter("all");
    setSearchQuery("");
    setOnlyMissingGuardian(false);
    setOnlyNoLogin(false);
    setCategoryFilter(incomingFilter.categoryId ?? "all");
    setGroupFilter(incomingFilter.groupId ?? "all");
    onIncomingFilterApplied?.();
  }, [incomingFilter, onIncomingFilterApplied]);

  const filtersActive =
    classFilter !== "all" ||
    sectionFilter !== "all" ||
    categoryFilter !== "all" ||
    groupFilter !== "all" ||
    onlyMissingGuardian ||
    onlyNoLogin ||
    Boolean(searchQuery.trim());

  const resetFilters = () => {
    setClassFilter("all");
    setSectionFilter("all");
    setCategoryFilter("all");
    setGroupFilter("all");
    setOnlyMissingGuardian(false);
    setOnlyNoLogin(false);
    setSearchQuery("");
  };

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedStudents = useMemo(
    () => students.filter((s) => selected.has(s.id)),
    [students, selected],
  );

  /* ── Bulk work ───────────────────────────────────────────────── */

  /** Status is the one thing the API changes in a single call. */
  const runBulkStatus = useCallback(
    async (status: "archived" | "active") => {
      setBusy(true);
      try {
        const res = await fetch("/api/students", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selected), status }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not update those students");
        toast.success(
          status === "archived"
            ? `${json.updated} student${json.updated === 1 ? "" : "s"} archived`
            : `${json.updated} student${json.updated === 1 ? "" : "s"} restored`,
        );
        clearSelection();
        await onRefresh?.();
      } catch (e) {
        toast.error((e as Error)?.message || "Could not update those students");
      } finally {
        setBusy(false);
        setConfirmArchive(null);
      }
    },
    [selected, clearSelection, onRefresh],
  );

  /**
   * Tags and class moves go one student at a time — the API deliberately keeps
   * its bulk arm to status only. Failures are counted rather than thrown so one
   * bad row does not strand the other forty.
   */
  const runBulkPatch = useCallback(
    async (patch: Record<string, unknown>, describe: (n: number) => string) => {
      setBusy(true);
      const ids = Array.from(selected);
      let done = 0;
      const failures: string[] = [];
      for (const id of ids) {
        try {
          const res = await fetch("/api/students", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...patch }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "failed");
          done += 1;
        } catch (e) {
          const name = students.find((s) => s.id === id)?.fullName || id;
          failures.push(`${name}: ${(e as Error)?.message || "failed"}`);
        }
      }
      setBusy(false);
      if (done > 0) toast.success(describe(done));
      if (failures.length > 0) {
        toast.error(`${failures.length} could not be updated`, { description: failures[0] });
      }
      clearSelection();
      setBulkTag(null);
      setBulkMove(false);
      await onRefresh?.();
    },
    [selected, students, clearSelection, onRefresh],
  );

  const bulkActions: BulkAction[] = useMemo(() => {
    const actions: BulkAction[] = [];
    if (onExport) {
      actions.push({
        key: "export",
        label: "Export",
        icon: Download,
        onRun: () => onExport(selectedStudents),
      });
    }
    actions.push({
      key: "move",
      label: "Review enrollment changes",
      icon: ArrowRightLeft,
      accent: "#0d9488",
      onRun: () => setBulkMove(true),
    });
    if (allCategories.length > 0) {
      actions.push({
        key: "category",
        label: "Set category",
        icon: Tag,
        accent: "#8127cf",
        onRun: () => setBulkTag({ kind: "category" }),
      });
    }
    if (allGroups.length > 0) {
      actions.push({
        key: "group",
        label: "Set group",
        icon: Users,
        accent: "#0284c7",
        onRun: () => setBulkTag({ kind: "group" }),
      });
    }
    const archivedCount = selectedStudents.filter((s) => s.status === "archived").length;
    if (archivedCount === selectedStudents.length && archivedCount > 0) {
      actions.push({
        key: "restore",
        label: "Restore",
        icon: RotateCcw,
        accent: "#10b981",
        onRun: () => setConfirmArchive("active"),
      });
    } else {
      actions.push({
        key: "archive",
        label: "Archive",
        icon: Archive,
        accent: "#e11d48",
        onRun: () => setConfirmArchive("archived"),
      });
    }
    return actions;
  }, [onExport, selectedStudents, allCategories.length, allGroups.length]);

  /* ── Tiles ───────────────────────────────────────────────────── */

  const tiles: StatTileSpec[] = [
    // SKO-401: both tiles act on the list. "On roll" shows everyone on roll (clearing every filter);
    // "Classes with students" orders the list class by class.
    { key: "roll", icon: Users, label: "Students on roll", value: students.length, tone: "violet", hint: filtersActive ? "Tap to show all" : "Showing all", active: !filtersActive, onClick: filtersActive ? () => resetFilters() : undefined },
    {
      key: "classes",
      icon: School,
      label: "Classes with students",
      value: classesCovered,
      hint: prefs.sortKey === "classOrder" ? "Sorted by class" : `of ${classes.length} class${classes.length === 1 ? "" : "es"} · tap to sort by class`,
      tone: "teal",
      active: prefs.sortKey === "classOrder",
      onClick: () => patchPrefs({ sortKey: prefs.sortKey === "classOrder" ? "name" : "classOrder" }),
    },
    {
      key: "contact",
      icon: PhoneCall,
      label: "No guardian contact",
      value: missingGuardian,
      hint: missingGuardian ? (onlyMissingGuardian ? "Showing these only" : "Tap to filter") : "All reachable",
      tone: missingGuardian ? "amber" : "emerald",
      active: onlyMissingGuardian,
      onClick: missingGuardian ? () => setOnlyMissingGuardian((v) => !v) : undefined,
    },
    {
      key: "login",
      icon: Mail,
      label: "No student login",
      value: noPortalLogin,
      hint: noPortalLogin ? (onlyNoLogin ? "Showing these only" : "Tap to filter") : "Everyone has access",
      tone: noPortalLogin ? "amber" : "emerald",
      active: onlyNoLogin,
      onClick: noPortalLogin ? () => setOnlyNoLogin((v) => !v) : undefined,
    },
  ];

  /* ── Table shape ─────────────────────────────────────────────── */

  const columns: DataColumn<Student>[] = [
    {
      key: "name",
      label: "Student",
      sortable: true,
      render: (s) => (
        <SystemButton variant="ghost"
          type="button"
          onClick={() => onViewStudent(s, filtered)}
          className="flex items-center gap-2.5 text-start justify-start"
        >
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-edge/30 bg-brand-50">
            <AvatarImage
              src={s.profileImageUrl}
              name={s.fullName}
              alt=""
              initialsClassName="text-2xs"
              className="h-full w-full object-cover"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink-strong transition-colors hover:text-primary">
              {s.fullName}
            </span>
            <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              Roll {s.rollNo || "—"}
            </span>
          </span>
        </SystemButton>
      ),
    },
    {
      key: "identity",
      label: "Pupil ID",
      render: (s) => <a className="sk-link block max-w-40 truncate text-xs text-primary" href={`/pupils/${s.id}`} title={s.id} onClick={e => e.stopPropagation()}><bdi>{s.id}</bdi></a>,
    },
    {
      key: "classOrder",
      label: "Class",
      sortable: true,
      render: (s) => <span className="text-xs font-medium text-ink">{classLabel(s.class)}</span>,
    },
    {
      key: "tags",
      label: "Tags",
      secondary: true,
      render: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.category?.name ? (
            <Badge variant="success" size="sm">{s.category.name}</Badge>
          ) : null}
          {s.group?.name ? (
            <Badge variant="info" size="sm">{s.group.name}</Badge>
          ) : null}
          {!s.category?.name && !s.group?.name ? (
            <span className="text-2xs font-semibold text-ink-subtle">—</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "guardian",
      label: "Guardian",
      sortable: true,
      render: (s) => {
        const noContact = !s.guardianPhone && !s.guardianEmail;
        return (
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-ink">{s.guardianName || "Not linked"}</p>
            <p
              className={cn(
                "truncate text-2xs font-medium",
                noContact ? "text-amber-600" : "text-ink-subtle",
              )}
            >
              {noContact ? "No phone or email" : s.guardianPhone || s.guardianEmail}
            </p>
          </div>
        );
      },
    },
    {
      key: "contact",
      label: "Reach",
      align: "center",
      secondary: true,
      render: (s) => <ContactActions student={s} />,
    },
    {
      key: "report",
      label: "Report",
      align: "right",
      render: (s) => <StatusPill status={s.reportCards?.[0]?.status ?? "NO_REPORT"} />,
    },
  ];

  /* ── Empty roster ────────────────────────────────────────────── */

  if (students.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title={classes.length === 0 ? "Create a class first" : "No students enrolled yet"}
        description={
          classes.length === 0
            ? "Students are admitted into a class, so there is nothing to enrol them into yet. Create your classes and sections under Academics → Classes & Subjects, then come back here."
            : "Admit your first student, or bulk-import an existing roster from a spreadsheet."
        }
        action={
          classes.length === 0 ? undefined : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <BrandButton onClick={() => onAddStudent()}>Add Student</BrandButton>
              {onBulkImport ? (
                <BrandButton variant="soft" icon={<Upload className="h-4 w-4" />} onClick={onBulkImport}>
                  Bulk Import
                </BrandButton>
              ) : null}
            </div>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <WorkspaceHeader
        icon={GraduationCap}
        eyebrow="Students"
        title="Student Directory"
        tone="students"
        summary={
          <>
            {filtered.length} of {students.length} shown
            {missingGuardian > 0 ? ` · ${missingGuardian} with no guardian contact` : ""}
            {untagged > 0 ? ` · ${untagged} with no category` : ""}
          </>
        }
        actions={
          <>
            <BrandButton variant="dark" icon={<Plus className="h-4 w-4" />} onClick={() => onAddStudent()}>
              Add Student
            </BrandButton>
            {onBulkImport ? (
              <BrandButton variant="soft" icon={<Upload className="h-4 w-4" />} onClick={onBulkImport}>
                Bulk Import
              </BrandButton>
            ) : null}
            {onExport ? (
              <BrandButton
                variant="soft"
                icon={<Download className="h-4 w-4" />}
                onClick={() => onExport(filtered)}
                disabled={filtered.length === 0}
              >
                Export {filtersActive ? `${filtered.length} Shown` : "CSV"}
              </BrandButton>
            ) : null}
          </>
        }
      />

      <StatTiles tiles={tiles} />

      <WorkspaceToolbar
        trailing={
          <>
            <ToolbarSelect
              value={prefs.sortKey}
              onChange={(v) => patchPrefs({ sortKey: v })}
              label="Sort by"
              options={Object.entries(SORTS).map(([k, v]) => [k, v.label] as [string, string])}
            />
            <SortDirButton
              dir={prefs.sortDir}
              onToggle={() => patchPrefs({ sortDir: prefs.sortDir === "asc" ? "desc" : "asc" })}
            />
            <ViewSwitch
              value={prefs.view}
              onChange={(v) => patchPrefs({ view: v })}
              options={[
                { value: "cards", label: "Cards", icon: LayoutGrid },
                { value: "table", label: "List", icon: Table2 },
              ]}
            />
          </>
        }
      >
        <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Name, roll no, guardian, phone…"
        />
        <ToolbarSelect
          value={classFilter}
          onChange={(v) => {
            setClassFilter(v);
            setSectionFilter("all");
          }}
          label="Class"
          options={[
            ["all", "All classes"],
            ...classGroups.map((g) => [g.key, `${g.name} · ${g.academicYear}`] as [string, string]),
          ]}
        />
        <ToolbarSelect
          value={sectionFilter}
          onChange={setSectionFilter}
          label="Section"
          options={[
            ["all", "All sections"],
            ...(selectedGroup?.sections || classes).map(
              (c) => [c.id, classLabel(c)] as [string, string],
            ),
          ]}
        />
        {categoryOptions.length ? (
          <ToolbarSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            label="Category"
            options={[
              ["all", "All categories"],
              ["none", "No category"],
              ...categoryOptions.map(([id, name]) => [id, name] as [string, string]),
            ]}
          />
        ) : null}
        {groupOptions.length ? (
          <ToolbarSelect
            value={groupFilter}
            onChange={setGroupFilter}
            label="Group"
            options={[
              ["all", "All groups"],
              ["none", "No group"],
              ...groupOptions.map(([id, name]) => [id, name] as [string, string]),
            ]}
          />
        ) : null}
        {missingGuardian > 0 ? (
          <ToolbarToggle
            active={onlyMissingGuardian}
            icon={TriangleAlert}
            label="No contact"
            count={missingGuardian}
            onClick={() => setOnlyMissingGuardian((v) => !v)}
          />
        ) : null}
        {filtersActive ? (
          <SystemButton variant="ghost"
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 justify-start"
          >
            <X className="h-3 w-3" /> Clear
          </SystemButton>
        ) : null}
      </WorkspaceToolbar>

      <SelectionBar
        total={selected.size}
        actions={bulkActions}
        onClear={clearSelection}
        busy={busy}
      />

      {prefs.view === "table" ? (
        <DataTable
          rows={paged.rows}
          columns={columns}
          rowKey={(s) => s.id}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={() =>
            setSelected((prev) =>
              paged.rows.every((r) => prev.has(r.id))
                ? new Set()
                : new Set(paged.rows.map((r) => r.id)),
            )
          }
          sort={{ key: prefs.sortKey, dir: prefs.sortDir }}
          onSort={(key) =>
            patchPrefs(
              key === prefs.sortKey
                ? { sortDir: prefs.sortDir === "asc" ? "desc" : "asc" }
                : { sortKey: key, sortDir: "asc" },
            )
          }
          onRowClick={(s) => onViewStudent(s, filtered)}
          empty="No students match your search and filters."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {paged.rows.map((student, i) => (
            <StudentCard
              key={student.id}
              student={student}
              index={i}
              selected={selected.has(student.id)}
              selectionActive={selected.size > 0}
              onToggleSelect={() => toggleSelect(student.id)}
              onOpen={() => onViewStudent(student, filtered)}
            />
          ))}
          {paged.rows.length === 0 ? (
            <div className="col-span-full">
              <EmptyInline text="No students match your search and filters. Try clearing them." />
            </div>
          ) : null}
        </div>
      )}

      <div className="rounded-[18px] border border-edge/20 bg-white px-4 py-2.5 shadow-sm">
        <Pagination
          page={paged.page}
          totalPages={paged.totalPages}
          perPage={prefs.perPage}
          total={filtered.length}
          firstShown={paged.firstShown}
          lastShown={paged.lastShown}
          onPage={paged.setPage}
          onPerPage={(n) => patchPrefs({ perPage: n })}
        />
      </div>

      {/* ── Bulk dialogs ── */}
      {bulkTag ? (
        <BulkTagModal
          kind={bulkTag.kind}
          count={selected.size}
          options={bulkTag.kind === "category" ? allCategories : allGroups}
          busy={busy}
          onClose={() => setBulkTag(null)}
          onApply={(value) =>
            runBulkPatch(
              bulkTag.kind === "category" ? { categoryId: value } : { groupId: value },
              (n) =>
                value
                  ? `${n} student${n === 1 ? "" : "s"} tagged`
                  : `${n} student${n === 1 ? "" : "s"} untagged`,
            )
          }
        />
      ) : null}

      {bulkMove ? (
        <Modal onClose={() => setBulkMove(false)} title="Review enrollment changes">
          <p className="mb-4">Review each pupil’s permanent identity, effective date and preserved records before changing placement.</p>
          <ul className="space-y-3">{students.filter(student => selected.has(student.id)).map(student => <li key={student.id}><a className="text-purple-700 underline" href={`/pupils/${student.id}`}>{student.fullName} · <bdi>{student.id}</bdi></a></li>)}</ul>
        </Modal>
      ) : null}

      <ConfirmAction
        open={confirmArchive !== null}
        title={confirmArchive === "archived" ? "Archive these students?" : "Restore these students?"}
        description={
          confirmArchive === "archived"
            ? `${selected.size} student${selected.size === 1 ? "" : "s"} will move off the active roster. Their records, marks and fees are kept, and you can restore them from Promote Students.`
            : `${selected.size} student${selected.size === 1 ? "" : "s"} will return to the active roster in their existing class.`
        }
        confirmLabel={confirmArchive === "archived" ? "Archive" : "Restore"}
        tone={confirmArchive === "archived" ? "danger" : "success"}
        busy={busy}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={() => confirmArchive && runBulkStatus(confirmArchive)}
      />
    </div>
  );
}

/* ────────────────────────── Card ────────────────────────── */

function StudentCard({
  student,
  index,
  selected,
  selectionActive,
  onToggleSelect,
  onOpen,
}: {
  student: Student;
  index: number;
  selected: boolean;
  selectionActive: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const report = student.reportCards?.[0];
  const noContact = !student.guardianPhone && !student.guardianEmail;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        } else if (e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
      className={cn(
        "sk-rise group/student relative cursor-pointer overflow-hidden rounded-[20px] border bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
        selected ? "border-primary ring-2 ring-primary/20" : "border-edge/25 hover:border-primary/30",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand-300 to-primary opacity-0 transition-opacity duration-300 group-hover/student:opacity-70" />

      <div className="relative">
        <div className="flex items-start gap-3">
          <SystemCheckbox

            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${student.fullName}`}
            className={cn(
              "mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary transition-opacity",
              selectionActive || selected ? "opacity-100" : "opacity-0 group-hover/student:opacity-100",
            )}
          />
          <div className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-primary/35 to-brand-400/20 p-[2.5px] shadow-sm transition-all duration-300 group-hover/student:scale-105 group-hover/student:from-primary group-hover/student:to-brand-400">
            <div className="h-full w-full overflow-hidden rounded-full border-2 border-white bg-brand-50">
              <AvatarImage
                src={student.profileImageUrl}
                name={student.fullName}
                alt="Student photo"
                initialsClassName="text-base"
                className="h-full w-full object-cover transition-transform duration-500 group-hover/student:scale-110"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-base font-bold tracking-tight text-ink-strong transition-colors duration-300 group-hover/student:text-primary"
              title={student.fullName}
            >
              {student.fullName}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider text-primary">
                Roll {student.rollNo || "—"}
              </span>
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                {classLabel(student.class)}
              </span>
              {student.category?.name ? (
                <Badge variant="success" size="sm">{student.category.name}</Badge>
              ) : null}
              {student.group?.name ? (
                <Badge variant="info" size="sm">{student.group.name}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-muted pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-3xs font-semibold uppercase tracking-wider text-ink-subtle">Guardian</p>
              <p className="truncate text-xs font-bold text-ink" title={student.guardianName || undefined}>
                {student.guardianName || "Not linked"}
              </p>
              <p
                className={cn(
                  "truncate text-2xs font-medium",
                  noContact ? "text-amber-600" : "text-ink-subtle",
                )}
              >
                {noContact ? "No phone or email" : student.guardianPhone || student.guardianEmail}
              </p>
            </div>
            {/* Reaching a guardian used to mean opening the student, reading a
                number and typing it into a phone. */}
            <div><ContactActions student={student} /><a className="mt-2 block break-all text-xs text-purple-700 underline" href={`/pupils/${student.id}`} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} aria-label={`Enrollment history for ${student.fullName}, ${student.id}`}><bdi>{student.id}</bdi></a></div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <StatusPill status={report ? report.status : "NO_REPORT"} />
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-primary/50 transition-all duration-300 group-hover/student:translate-x-0.5 group-hover/student:bg-primary group-hover/student:text-white">
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Call, WhatsApp and email a guardian without leaving the roster. */
function ContactActions({ student }: { student: Student }) {
  const tel = telHref(student.guardianPhone);
  const wa = waHref(student.guardianWhatsapp || student.guardianPhone);
  const mail = student.guardianEmail ? `mailto:${student.guardianEmail}` : null;
  if (!tel && !wa && !mail) return <span className="text-2xs font-semibold text-ink-subtle">—</span>;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const cls =
    "flex h-10 w-10 items-center justify-center rounded-full border border-edge/25 bg-white sm:h-8 sm:w-8 text-ink-muted transition-colors hover:border-primary/40 hover:text-primary";

  return (
    <div className="flex shrink-0 items-center gap-1">
      {tel ? (
        <Tooltip content={`Call ${student.guardianPhone}`}>
          <a href={tel} onClick={stop} aria-label="Call guardian" className={cls}>
            <PhoneCall aria-hidden="true" className="h-3 w-3" />
          </a>
        </Tooltip>
      ) : null}
      {wa ? (
        <Tooltip content="Message on WhatsApp">
          <a
            href={wa}
            onClick={stop}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Message guardian on WhatsApp"
            className={cls}
          >
            <MessageCircle aria-hidden="true" className="h-3 w-3" />
          </a>
        </Tooltip>
      ) : null}
      {mail ? (
        <Tooltip content={student.guardianEmail || "Email guardian"}>
          <a href={mail} onClick={stop} aria-label="Email guardian" className={cls}>
            <Mail aria-hidden="true" className="h-3 w-3" />
          </a>
        </Tooltip>
      ) : null}
    </div>
  );
}

/* ────────────────────────── Bulk dialogs ────────────────────────── */

function BulkSheet({
  title,
  subtitle,
  busy,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Modal
      title={title}
      eyebrow="Bulk change"
      subtitle={subtitle}
      icon={Users}
      size="xs"
      onClose={onClose}
      disableBackdropClose={busy}
      hideClose={busy}
      footer={<div className="flex gap-2">{footer}</div>}
    >
      {children}
    </Modal>
  );
}

function BulkTagModal({
  kind,
  count,
  options,
  busy,
  onClose,
  onApply,
}: {
  kind: "category" | "group";
  count: number;
  options: TagOption[];
  busy: boolean;
  onClose: () => void;
  onApply: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const noun = kind === "category" ? "category" : "group";

  return (
    <BulkSheet
      title={`Set ${noun}`}
      subtitle={`${count} student${count === 1 ? "" : "s"} selected`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <BrandButton variant="soft" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </BrandButton>
          <BrandButton variant="gradient" onClick={() => onApply(value)} disabled={busy} className="flex-1">
            {value ? `Apply ${noun}` : `Clear ${noun}`}
          </BrandButton>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          {kind === "category" ? "Category" : "Group"}
        </span>
        <SystemSelect
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full cursor-pointer px-4 py-2.5"
        >
          <option value="">— None (clear it) —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SystemSelect>
      </label>
      <p className="mt-3 text-2xs font-semibold leading-relaxed text-ink-muted">
        This replaces whatever {noun} each selected student has now.
      </p>
    </BulkSheet>
  );
}
