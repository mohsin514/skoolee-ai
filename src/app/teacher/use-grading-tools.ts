"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAcademicYear } from "@/components/academic-year/CycleGate";
import { apiErrorMessage } from "@/lib/errors";

/**
 * The "assessment + grading" toolbar shared by the teacher dashboard and the
 * marks page: create an assessment, edit grade weights, preview weighted final
 * grades, and save them as report cards.
 *
 * Both pages used to carry their own copy of this, which is how they drifted —
 * the same `academicYear` bug had to be fixed twice, and a fix applied to one
 * page silently missed the other. Keeping it here means both surfaces move
 * together.
 */

const DEFAULT_GRADE_CONFIG: Record<string, number> = {
  quizWeight: 10,
  classTestWeight: 20,
  midTermWeight: 30,
  finalWeight: 40,
  passingPercentage: 50,
  gradeAplus: 90,
  gradeA: 80,
  gradeB: 70,
  gradeC: 60,
  gradeD: 50,
};

const EMPTY_EXAM_FORM = {
  title: "",
  term: "",
  classId: "",
  subjectId: "",
  examType: "CLASS_TEST",
};

/** Server actions return raw text; parse defensively so a stray HTML error page
 *  surfaces as a readable message instead of "Unexpected token <". */
async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("An unexpected response was received from the server.");
  }
}


export function useGradingTools({ onChanged }: { onChanged?: () => void | Promise<void> } = {}) {
  const academicYear = useAcademicYear();

  const [showExamModal, setShowExamModal] = useState(false);
  const [examForm, setExamForm] = useState({ ...EMPTY_EXAM_FORM });
  const [creatingExam, setCreatingExam] = useState(false);

  const [showGradeConfigModal, setShowGradeConfigModal] = useState(false);
  const [gradeConfig, setGradeConfig] = useState<Record<string, number>>({});
  const [gradeConfigLoading, setGradeConfigLoading] = useState(false);
  const [gradeConfigSaving, setGradeConfigSaving] = useState(false);

  const [showGradeOverviewModal, setShowGradeOverviewModal] = useState(false);
  const [selectedGradeClassId, setSelectedGradeClassId] = useState("");
  const [weightedGradeResult, setWeightedGradeResult] = useState<any>(null);
  const [weightedGradeLoading, setWeightedGradeLoading] = useState(false);
  const [generatingReportCards, setGeneratingReportCards] = useState(false);
  const [reportCardsGenerated, setReportCardsGenerated] = useState(false);

  const createExam = useCallback(async () => {
    // The API rejects a blank term too, so check it here rather than letting
    // the teacher discover it from a failed round-trip.
    if (!examForm.title.trim() || !examForm.classId || !examForm.term.trim()) {
      toast.error("Title, class and term are all required");
      return;
    }
    setCreatingExam(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...examForm, academicYear }),
      });
      const result = await readJson(res);
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to create assessment"));
      toast.success(`Assessment "${examForm.title}" created`);
      setShowExamModal(false);
      setExamForm({ ...EMPTY_EXAM_FORM });
      await onChanged?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreatingExam(false);
    }
  }, [examForm, academicYear, onChanged]);

  const loadGradeConfig = useCallback(
    async (classId: string) => {
      if (!classId) return;
      setGradeConfigLoading(true);
      try {
        const res = await fetch(
          `/api/grade-config?classId=${classId}&academicYear=${academicYear}`,
        );
        const result = await readJson(res);
        if (result.config) {
          const {
            quizWeight, classTestWeight, midTermWeight, finalWeight,
            passingPercentage, gradeAplus, gradeA, gradeB, gradeC, gradeD,
          } = result.config;
          setGradeConfig({
            quizWeight, classTestWeight, midTermWeight, finalWeight,
            passingPercentage, gradeAplus, gradeA, gradeB, gradeC, gradeD,
          });
        } else {
          setGradeConfig({ ...DEFAULT_GRADE_CONFIG });
        }
      } catch {
        // A class with no saved config is the normal first-time case, so fall
        // back to sensible weights rather than showing an error.
        setGradeConfig({ ...DEFAULT_GRADE_CONFIG });
      } finally {
        setGradeConfigLoading(false);
      }
    },
    [academicYear],
  );

  const saveGradeConfig = useCallback(async () => {
    if (!selectedGradeClassId) return;
    setGradeConfigSaving(true);
    try {
      const res = await fetch("/api/grade-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedGradeClassId, academicYear, ...gradeConfig }),
      });
      const result = await readJson(res);
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Failed to save"));
      toast.success("Grade configuration saved");
      setShowGradeConfigModal(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGradeConfigSaving(false);
    }
  }, [selectedGradeClassId, gradeConfig, academicYear]);

  const loadWeightedGrade = useCallback(
    async (classId: string) => {
      if (!classId) return;
      setWeightedGradeLoading(true);
      setWeightedGradeResult(null);
      try {
        const res = await fetch(
          `/api/grade-config/weighted-result?classId=${classId}&academicYear=${academicYear}`,
        );
        const result = await readJson(res);
        if (!res.ok) throw new Error(apiErrorMessage(result.error, "No grades available"));
        setWeightedGradeResult(result.grades || []);
      } catch (error: any) {
        toast.error(error.message);
      } finally {
        setWeightedGradeLoading(false);
      }
    },
    [academicYear],
  );

  const generateReportCards = useCallback(async () => {
    if (!selectedGradeClassId) return;
    setGeneratingReportCards(true);
    try {
      const res = await fetch("/api/reports/generate-from-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedGradeClassId, academicYear }),
      });
      const result = await readJson(res);
      if (!res.ok) throw new Error(apiErrorMessage(result.error, "Report card generation failed"));
      toast.success(`Generated ${result.count || 0} report cards`);
      setReportCardsGenerated(true);
      await onChanged?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setGeneratingReportCards(false);
    }
  }, [selectedGradeClassId, academicYear, onChanged]);

  /** Open "Grade Config" pre-loaded with the first class the teacher owns. */
  const openGradeConfig = useCallback(
    (fallbackClassId?: string) => {
      const id = selectedGradeClassId || fallbackClassId || "";
      if (id) {
        setSelectedGradeClassId(id);
        loadGradeConfig(id);
      }
      setShowGradeConfigModal(true);
    },
    [selectedGradeClassId, loadGradeConfig],
  );

  /** Open "Final Grades" with a clean result set. */
  const openFinalGrades = useCallback(
    (fallbackClassId?: string) => {
      const id = selectedGradeClassId || fallbackClassId || "";
      if (id) setSelectedGradeClassId(id);
      setWeightedGradeResult(null);
      setReportCardsGenerated(false);
      setShowGradeOverviewModal(true);
    },
    [selectedGradeClassId],
  );

  return {
    academicYear,
    // Create assessment
    showExamModal, setShowExamModal, examForm, setExamForm, creatingExam, createExam,
    // Grade weights
    showGradeConfigModal, setShowGradeConfigModal, gradeConfig, setGradeConfig,
    gradeConfigLoading, gradeConfigSaving, loadGradeConfig, saveGradeConfig, openGradeConfig,
    // Final grades
    showGradeOverviewModal, setShowGradeOverviewModal, selectedGradeClassId, setSelectedGradeClassId,
    weightedGradeResult, setWeightedGradeResult, weightedGradeLoading, loadWeightedGrade,
    generatingReportCards, reportCardsGenerated, setReportCardsGenerated,
    generateReportCards, openFinalGrades,
  };
}
