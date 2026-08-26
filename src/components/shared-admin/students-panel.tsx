"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";
import { BrandButton, EmptyState } from "@/components/role-dashboard";
import { AvatarImage } from "@/components/ui/avatar-image";
import { ConfirmAction } from "@/components/ui/confirm-action";
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

  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyMissingGuardian, setOnlyMissingGuardian] = useState(false);
  const [onlyNoLogin, setOnlyNoLogin] = useState(false);

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
      label: "Move to section",
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
    { key: "roll", icon: Users, label: "Students on roll", value: students.length, tone: "violet" },
    {
      key: "classes",
      icon: School,
      label: "Classes with students",
      value: classesCovered,
      hint: `of ${classes.length} class${classes.length === 1 ? "" : "es"}`,
      tone: "teal",
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
        <button
          type="button"
          onClick={() => onViewStudent(s, filtered)}
          className="flex cursor-pointer items-center gap-2.5 text-left"
        >
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#cfc2d6]/30 bg-[#fbf0fe]">
            <AvatarImage
              src={s.profileImageUrl}
              name={s.fullName}
              alt=""
              initialsClassName="text-[10px]"
              className="h-full w-full object-cover"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-[#1f1a23] transition-colors hover:text-[#8127cf]">
              {s.fullName}
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
              Roll {s.rollNo || "—"}
            </span>
          </span>
        </button>
      ),
    },
    {
      key: "classOrder",
      label: "Class",
      sortable: true,
      render: (s) => <span className="text-xs font-bold text-ink">{classLabel(s.class)}</span>,
    },
    {
      key: "tags",
      label: "Tags",
      secondary: true,
      render: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.category?.name ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600">
              {s.category.name}
            </span>
          ) : null}
          {s.group?.name ? (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-600">
              {s.group.name}
            </span>
          ) : null}
          {!s.category?.name && !s.group?.name ? (
            <span className="text-[11px] font-semibold text-ink-subtle">—</span>
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
                "truncate text-[10px] font-bold",
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
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[11px] font-black uppercase tracking-wider text-ink-subtle transition-colors hover:text-[#8127cf]"
          >
            <X className="h-3 w-3" /> Clear
          </button>
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

      <div className="rounded-[18px] border border-[#cfc2d6]/20 bg-white px-4 py-2.5 shadow-sm">
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
        <BulkMoveModal
          count={selected.size}
          classes={classes}
          busy={busy}
          onClose={() => setBulkMove(false)}
          onApply={(classId) =>
            runBulkPatch({ classId }, (n) => `${n} student${n === 1 ? "" : "s"} moved`)
          }
        />
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
        "sk-rise group/student relative cursor-pointer overflow-hidden rounded-[20px] border bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_8px_20px_-12px_rgba(31,26,35,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8127cf]/30 focus-visible:ring-offset-1",
        selected ? "border-[#8127cf] ring-2 ring-[#8127cf]/20" : "border-[#cfc2d6]/25 hover:border-[#8127cf]/30",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#8127cf] via-[#b876f0] to-[#8127cf] opacity-0 transition-opacity duration-300 group-hover/student:opacity-70" />

      <div className="relative">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${student.fullName}`}
            className={cn(
              "mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#8127cf] transition-opacity",
              selectionActive || selected ? "opacity-100" : "opacity-0 group-hover/student:opacity-100",
            )}
          />
          <div className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-[#8127cf]/35 to-[#9c48ea]/20 p-[2.5px] shadow-sm transition-all duration-300 group-hover/student:scale-105 group-hover/student:from-[#8127cf] group-hover/student:to-[#9c48ea]">
            <div className="h-full w-full overflow-hidden rounded-full border-2 border-white bg-[#fbf0fe]">
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
              className="truncate text-base font-black tracking-tight text-[#1f1a23] transition-colors duration-300 group-hover/student:text-[#8127cf]"
              title={student.fullName}
            >
              {student.fullName}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#fbf0fe] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#8127cf]">
                Roll {student.rollNo || "—"}
              </span>
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#f3f4f9] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-ink-muted">
                {classLabel(student.class)}
              </span>
              {student.category?.name ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                  {student.category.name}
                </span>
              ) : null}
              {student.group?.name ? (
                <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-sky-600">
                  {student.group.name}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-[#f3f4f9] pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-wider text-ink-subtle">Guardian</p>
              <p className="truncate text-xs font-bold text-ink" title={student.guardianName || undefined}>
                {student.guardianName || "Not linked"}
              </p>
              <p
                className={cn(
                  "truncate text-[10px] font-bold",
                  noContact ? "text-amber-600" : "text-ink-subtle",
                )}
              >
                {noContact ? "No phone or email" : student.guardianPhone || student.guardianEmail}
              </p>
            </div>
            {/* Reaching a guardian used to mean opening the student, reading a
                number and typing it into a phone. */}
            <ContactActions student={student} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <StatusPill status={report ? report.status : "NO_REPORT"} />
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fbf0fe] text-[#8127cf]/50 transition-all duration-300 group-hover/student:translate-x-0.5 group-hover/student:bg-[#8127cf] group-hover/student:text-white">
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
  if (!tel && !wa && !mail) return <span className="text-[11px] font-semibold text-ink-subtle">—</span>;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const cls =
    "flex h-7 w-7 items-center justify-center rounded-full border border-[#cfc2d6]/25 bg-white text-ink-muted transition-colors hover:border-[#8127cf]/40 hover:text-[#8127cf]";

  return (
    <div className="flex shrink-0 items-center gap-1">
      {tel ? (
        <a href={tel} onClick={stop} title={`Call ${student.guardianPhone}`} aria-label="Call guardian" className={cls}>
          <PhoneCall className="h-3 w-3" />
        </a>
      ) : null}
      {wa ? (
        <a
          href={wa}
          onClick={stop}
          target="_blank"
          rel="noopener noreferrer"
          title="Message on WhatsApp"
          aria-label="Message guardian on WhatsApp"
          className={cls}
        >
          <MessageCircle className="h-3 w-3" />
        </a>
      ) : null}
      {mail ? (
        <a href={mail} onClick={stop} title={student.guardianEmail || ""} aria-label="Email guardian" className={cls}>
          <Mail className="h-3 w-3" />
        </a>
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
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">
          {kind === "category" ? "Category" : "Group"}
        </span>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
        >
          <option value="">— None (clear it) —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-[11px] font-semibold leading-relaxed text-ink-muted">
        This replaces whatever {noun} each selected student has now.
      </p>
    </BulkSheet>
  );
}

function BulkMoveModal({
  count,
  classes,
  busy,
  onClose,
  onApply,
}: {
  count: number;
  classes: { id: string; name?: string; section?: string | null }[];
  busy: boolean;
  onClose: () => void;
  onApply: (classId: string) => void;
}) {
  const groups = useMemo(() => groupClasses(classes), [classes]);
  const [groupKey, setGroupKey] = useState("");
  const [classId, setClassId] = useState("");
  const sections = groups.find((g) => g.key === groupKey)?.sections || [];

  return (
    <BulkSheet
      title="Move to a section"
      subtitle={`${count} student${count === 1 ? "" : "s"} selected`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <BrandButton variant="soft" onClick={onClose} disabled={busy} className="flex-1">
            Cancel
          </BrandButton>
          <BrandButton
            variant="gradient"
            onClick={() => onApply(classId)}
            disabled={busy || !classId}
            className="flex-1"
          >
            Move {count}
          </BrandButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Class</span>
          <select
            value={groupKey}
            onChange={(e) => {
              setGroupKey(e.target.value);
              setClassId("");
            }}
            className="w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40"
          >
            <option value="">Select class</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name} · {g.academicYear}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-ink-muted">Section</span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            disabled={!groupKey}
            className="w-full cursor-pointer rounded-2xl border border-[#cfc2d6]/25 bg-white px-4 py-2.5 text-sm font-semibold text-[#1f1a23] outline-none focus:border-[#8127cf]/40 disabled:opacity-50"
          >
            <option value="">Select section</option>
            {sections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.section ? `Section ${c.section}` : "Whole class"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-relaxed text-amber-700">
        Each student is re-issued a roll number in the new section. Students already in the chosen
        section are left alone.
      </p>
    </BulkSheet>
  );
}
