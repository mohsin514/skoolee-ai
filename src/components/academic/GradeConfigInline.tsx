"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { BrandButton } from "@/components/role-dashboard";
import { cn } from "@/lib/utils";
import type { ExamItem } from "@/components/academic/ExamCycleManager";

interface GradeConfig {
  quizWeight: number;
  classTestWeight: number;
  midTermWeight: number;
  finalWeight: number;
  passingPercentage: number;
  weightMode: "NORMALIZED" | "ABSOLUTE";
  gradeAplus: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
}

const EMPTY: GradeConfig = {
  quizWeight: 10,
  classTestWeight: 20,
  midTermWeight: 30,
  finalWeight: 40,
  passingPercentage: 50,
  weightMode: "NORMALIZED",
  gradeAplus: 90,
  gradeA: 80,
  gradeB: 70,
  gradeC: 60,
  gradeD: 50,
};

type NumericConfigKey = {
  [K in keyof GradeConfig]: GradeConfig[K] extends number ? K : never;
}[keyof GradeConfig];

const THRESHOLDS: { key: NumericConfigKey; label: string }[] = [
  { key: "gradeAplus", label: "A+" },
  { key: "gradeA", label: "A" },
  { key: "gradeB", label: "B" },
  { key: "gradeC", label: "C" },
  { key: "gradeD", label: "D" },
];

const MODES: { key: GradeConfig["weightMode"]; label: string; help: string }[] = [
  {
    key: "NORMALIZED",
    label: "Rescale to exams held",
    help: "Repeated exams of the same type are averaged, then the weights of the exam types that have actually happened are rescaled to 100%. Full marks in the only exam so far reads as 100%.",
  },
  {
    key: "ABSOLUTE",
    label: "Score against the full year",
    help: "Every exam scores against the whole 100-point year, so exam types that have not happened yet count as zero. Percentages stay low until the year is complete.",
  },
];

export function GradeConfigInline({
  exam,
  campusId,
}: {
  exam: ExamItem;
  campusId?: string;
}) {
  const classId = exam.classId;
  const academicYear = exam.academicYear;

  const [cfg, setCfg] = useState<GradeConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ classId, academicYear: String(academicYear) });
      const res = await fetch(`/api/grade-config?${sp.toString()}`).then((r) => r.json());
      if (res.config) setCfg(res.config as GradeConfig);
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, [classId, academicYear]);

  const loadPreview = useCallback(async () => {
    try {
      const sp = new URLSearchParams({ classId, academicYear: String(academicYear) });
      const res = await fetch(`/api/grade-config/weighted-result?${sp.toString()}`).then((r) =>
        r.json()
      );
      if (!res.success) throw new Error(res.error || "No weighted data");
      setPreview((res.grades || []).slice(0, 3));
      setPreviewError(null);
    } catch (e: any) {
      setPreview(null);
      setPreviewError(e?.message || "No grade data yet");
    }
  }, [classId, academicYear]);

  useEffect(() => {
    load();
    loadPreview();
  }, [load, loadPreview]);

  const finalWeight = Math.max(0, 100 - cfg.quizWeight - cfg.classTestWeight - cfg.midTermWeight);
  const total = cfg.quizWeight + cfg.classTestWeight + cfg.midTermWeight + finalWeight;

  const setWeight = (key: "quizWeight" | "classTestWeight" | "midTermWeight", value: number) => {
    const others =
      key === "quizWeight"
        ? cfg.classTestWeight + cfg.midTermWeight
        : key === "classTestWeight"
        ? cfg.quizWeight + cfg.midTermWeight
        : cfg.quizWeight + cfg.classTestWeight;
    const clamped = Math.max(0, Math.min(value, 100 - others));
    setCfg((c) => ({ ...c, [key]: clamped }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const sp = new URLSearchParams();
      if (campusId) sp.set("campusId", campusId);
      const res = await fetch(`/api/grade-config?${sp.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          academicYear,
          quizWeight: cfg.quizWeight,
          classTestWeight: cfg.classTestWeight,
          midTermWeight: cfg.midTermWeight,
          finalWeight,
          passingPercentage: cfg.passingPercentage,
          weightMode: cfg.weightMode,
          gradeAplus: cfg.gradeAplus,
          gradeA: cfg.gradeA,
          gradeB: cfg.gradeB,
          gradeC: cfg.gradeC,
          gradeD: cfg.gradeD,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Grade configuration saved");
      // The live preview below is computed from these rules, so recompute it —
      // otherwise the admin changes the mode and sees the old percentages.
      loadPreview();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-skeleton-in">
        <div className="h-10 w-full rounded-2xl bg-[#e8e0ec]/40 skeleton-shimmer" />
        <div className="h-40 w-full rounded-3xl bg-[#e8e0ec]/40 skeleton-shimmer" />
      </div>
    );
  }

  const sliders: {
    key: "quizWeight" | "classTestWeight" | "midTermWeight";
    label: string;
  }[] = [
    { key: "quizWeight", label: "Quiz" },
    { key: "classTestWeight", label: "Class Test" },
    { key: "midTermWeight", label: "Mid Term" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-[#cfc2d6]/15 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-black text-[#1d1b20]">Weight Distribution</p>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider",
              total === 100
                ? "bg-emerald-50 text-emerald-600"
                : "bg-amber-50 text-amber-600"
            )}
          >
            Total {total}%
          </span>
        </div>

        <div className="space-y-4">
          {sliders.map((s) => (
            <div key={s.key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-ink">{s.label}</span>
                <span className="text-xs font-black text-[#8127cf]">{cfg[s.key]}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={cfg[s.key]}
                onChange={(e) => setWeight(s.key, Number(e.target.value))}
                className="w-full accent-[#8127cf]"
              />
            </div>
          ))}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-ink">Final (auto)</span>
              <span className="text-xs font-black text-[#0d9488]">{finalWeight}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={finalWeight}
              disabled
              className="w-full accent-[#0d9488] opacity-70"
            />
            <p className="mt-1 text-[10px] font-semibold text-ink-subtle">
              Final weight auto-adjusts so the four sum to 100%.
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-ink">Passing %</span>
              <span className="text-xs font-black text-[#d97706]">{cfg.passingPercentage}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={cfg.passingPercentage}
              onChange={(e) => setCfg({ ...cfg, passingPercentage: Number(e.target.value) })}
              className="w-full accent-[#d97706]"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-ink">Overall percentage</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {MODES.map((m) => {
                const active = cfg.weightMode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setCfg({ ...cfg, weightMode: m.key })}
                    aria-pressed={active}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-[#7c3aed]/40 bg-[#7c3aed]/5"
                        : "border-[#cfc2d6]/25 bg-white hover:border-[#cfc2d6]/50"
                    }`}
                  >
                    <span className="block text-xs font-black text-[#1d1b20]">{m.label}</span>
                    <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-ink-muted">
                      {m.help}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <BrandButton variant="gradient" onClick={save} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Configuration
          </BrandButton>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-3xl border border-[#cfc2d6]/15 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-black text-[#1d1b20]">Grade Thresholds</p>
          <div className="overflow-hidden rounded-2xl border border-[#cfc2d6]/10">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fbf0fe]/40 text-[9px] font-black uppercase tracking-wider text-ink-muted">
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2 text-right">Min %</th>
                </tr>
              </thead>
              <tbody>
                {THRESHOLDS.map((t) => (
                  <tr key={t.key} className="border-t border-[#cfc2d6]/10">
                    <td className="px-3 py-2 text-sm font-black text-[#1d1b20]">{t.label}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={cfg[t.key]}
                        onChange={(e) =>
                          setCfg({ ...cfg, [t.key]: Math.max(0, Math.min(100, Number(e.target.value))) })
                        }
                        className="w-20 rounded-xl border border-[#cfc2d6]/20 bg-white px-2 py-1 text-right text-sm font-bold text-[#1d1b20] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/20"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-[#cfc2d6]/15 bg-white p-5 shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-sm font-black text-[#1d1b20]">
            <Sparkles className="h-4 w-4 text-[#8127cf]" /> Live Preview
          </p>
          {previewError ? (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[11px] font-semibold text-amber-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {previewError}
            </div>
          ) : preview && preview.length > 0 ? (
            <div className="space-y-2">
              {preview.map((g, i) => (
                <div
                  key={g.studentId || i}
                  className="flex items-center justify-between rounded-2xl bg-[#fbf0fe]/40 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#1d1b20]">
                      {g.studentName || g.name || `Student ${i + 1}`}
                    </p>
                    <p className="text-[10px] font-semibold text-ink-subtle">
                      Roll {g.rollNo ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#8127cf]">
                      {Math.round(g.percentage ?? 0)}%
                    </p>
                    <p className="text-[10px] font-bold text-[#0d9488]">{g.grade || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-[11px] font-semibold text-ink-subtle">
              No sample students available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
