"use client";

import { useCallback, useState } from "react";
import { useAcademicYear } from "@/components/academic-year/CycleGate";
import { apiErrorMessage } from "@/lib/errors";

/**
 * The teacher's weighted final-grades preview (read only).
 *
 * Creating tests moved to Tests & quizzes (ExamCycleManager, QUIZ / CLASS_TEST only), grade weights and
 * thresholds belong to the academic lead (Curriculum & grading; the API refuses a teacher), and
 * generating final grades — which publishes a FINAL exam and report cards — is the academic lead's
 * decision too (M60–M62, G33). What stays with the teacher is the preview and its PDF.
 */

/** Server responses are parsed defensively so a stray HTML error page reads as a sentence. */
async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("An unexpected response was received from the server.");
  }
}

export function useGradingTools() {
  const academicYear = useAcademicYear();

  const [showGradeOverviewModal, setShowGradeOverviewModal] = useState(false);
  const [selectedGradeClassId, setSelectedGradeClassId] = useState("");
  const [weightedGradeResult, setWeightedGradeResult] = useState<any[] | null>(null);
  const [weightedGradeLoading, setWeightedGradeLoading] = useState(false);
  /** R4 (G18): a failed preview load is shown inline in the dialog with a retry — never a toast. */
  const [weightedGradeError, setWeightedGradeError] = useState<string | null>(null);

  const loadWeightedGrade = useCallback(
    async (classId: string) => {
      if (!classId) return;
      setWeightedGradeLoading(true);
      setWeightedGradeResult(null);
      setWeightedGradeError(null);
      try {
        const res = await fetch(
          `/api/grade-config/weighted-result?classId=${encodeURIComponent(classId)}&academicYear=${encodeURIComponent(String(academicYear))}`,
        );
        const result = await readJson(res);
        if (!res.ok) throw new Error(apiErrorMessage(result.error, "No grades are available for this class yet."));
        setWeightedGradeResult(result.grades || []);
      } catch (error) {
        setWeightedGradeError(error instanceof Error && error.message ? error.message : "No grades are available for this class yet.");
      } finally {
        setWeightedGradeLoading(false);
      }
    },
    [academicYear],
  );

  /** Open the preview for the current class, or the first class the teacher owns. */
  const openFinalGrades = useCallback(
    (fallbackClassId?: string) => {
      const id = selectedGradeClassId || fallbackClassId || "";
      if (id) setSelectedGradeClassId(id);
      setWeightedGradeResult(null);
      setWeightedGradeError(null);
      setShowGradeOverviewModal(true);
    },
    [selectedGradeClassId],
  );

  return {
    academicYear,
    showGradeOverviewModal, setShowGradeOverviewModal,
    selectedGradeClassId, setSelectedGradeClassId,
    weightedGradeResult, setWeightedGradeResult,
    weightedGradeLoading, loadWeightedGrade,
    weightedGradeError, setWeightedGradeError,
    openFinalGrades,
  };
}
