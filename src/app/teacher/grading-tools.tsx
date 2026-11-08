"use client";

import { FinalGradesModal } from "@/components/teacher/teacher-components";
import type { useGradingTools } from "./use-grading-tools";

type Grading = ReturnType<typeof useGradingTools>;

/**
 * The weighted final-grades preview dialog, opened from the Marks page's "More actions" menu.
 * (The old three-button grading toolbar — New Assessment, Grade Config, Final Grades — is gone:
 * see `use-grading-tools.ts` for where each of those now lives.)
 */
export function FinalGradesPreview({
  grading,
  classHubs,
}: {
  grading: Grading;
  classHubs: any[];
}) {
  return (
    <FinalGradesModal
      open={grading.showGradeOverviewModal}
      classHubs={classHubs}
      selectedGradeClassId={grading.selectedGradeClassId}
      weightedGradeResult={grading.weightedGradeResult}
      weightedGradeLoading={grading.weightedGradeLoading}
      weightedGradeError={grading.weightedGradeError}
      onClose={() => grading.setShowGradeOverviewModal(false)}
      onClassChange={(id) => {
        grading.setSelectedGradeClassId(id);
        grading.setWeightedGradeResult(null);
        grading.setWeightedGradeError(null);
      }}
      onGenerate={grading.loadWeightedGrade}
    />
  );
}
