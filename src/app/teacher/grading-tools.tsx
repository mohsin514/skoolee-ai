"use client";

import { BarChart3, FileText, Star } from "lucide-react";
import { BrandButton } from "@/components/role-dashboard";
import { Tooltip } from "@/components/ui/tooltip";
import {
  CreateAssessmentModal,
  FinalGradesModal,
  GradeConfigModal,
} from "@/components/teacher/teacher-components";
import type { useGradingTools } from "./use-grading-tools";

type Grading = ReturnType<typeof useGradingTools>;

/**
 * The three grading buttons and their modals, shared by the teacher dashboard
 * and the marks page so the two surfaces cannot drift apart again.
 */

export function GradingToolbar({
  grading,
  classHubs,
  createLabel = "New Assessment",
}: {
  grading: Grading;
  classHubs: any[];
  createLabel?: string;
}) {
  const firstClassId = classHubs[0]?.id;
  // The hints used to sit in native title attributes on an inner span, which
  // never show for keyboard or touch users; the shared Tooltip shows them on
  // hover, focus and long-press.
  return (
    <>
      <Tooltip content="Create a new exam or test">
        <BrandButton
          variant="soft"
          icon={<Star aria-hidden="true" className="w-4 h-4" />}
          onClick={() => grading.setShowExamModal(true)}
        >
          {createLabel}
        </BrandButton>
      </Tooltip>
      <Tooltip content="Configure grading weights and thresholds">
        <BrandButton
          variant="soft"
          icon={<FileText aria-hidden="true" className="w-4 h-4" />}
          onClick={() => grading.openGradeConfig(firstClassId)}
        >
          Grade Config
        </BrandButton>
      </Tooltip>
      <Tooltip content="View weighted final grades">
        <BrandButton
          variant="dark"
          icon={<BarChart3 aria-hidden="true" className="w-4 h-4" />}
          onClick={() => grading.openFinalGrades(firstClassId)}
        >
          Final Grades
        </BrandButton>
      </Tooltip>
    </>
  );
}

export function GradingModals({
  grading,
  classHubs,
}: {
  grading: Grading;
  classHubs: any[];
}) {
  return (
    <>
      <CreateAssessmentModal
        open={grading.showExamModal}
        classHubs={classHubs}
        examForm={grading.examForm}
        creatingExam={grading.creatingExam}
        onClose={() => grading.setShowExamModal(false)}
        onFormChange={(field, value) =>
          grading.setExamForm((f: any) => ({ ...f, [field]: value }))
        }
        onCreate={grading.createExam}
      />
      <GradeConfigModal
        open={grading.showGradeConfigModal}
        classHubs={classHubs}
        selectedGradeClassId={grading.selectedGradeClassId}
        gradeConfig={grading.gradeConfig}
        gradeConfigLoading={grading.gradeConfigLoading}
        gradeConfigSaving={grading.gradeConfigSaving}
        onClose={() => grading.setShowGradeConfigModal(false)}
        onClassChange={(id) => {
          grading.setSelectedGradeClassId(id);
          grading.loadGradeConfig(id);
        }}
        onConfigChange={grading.setGradeConfig}
        onSave={grading.saveGradeConfig}
      />
      <FinalGradesModal
        open={grading.showGradeOverviewModal}
        classHubs={classHubs}
        selectedGradeClassId={grading.selectedGradeClassId}
        weightedGradeResult={grading.weightedGradeResult}
        weightedGradeLoading={grading.weightedGradeLoading}
        generatingReportCards={grading.generatingReportCards}
        reportCardsGenerated={grading.reportCardsGenerated}
        onClose={() => grading.setShowGradeOverviewModal(false)}
        onClassChange={(id) => {
          grading.setSelectedGradeClassId(id);
          grading.setWeightedGradeResult(null);
          grading.setReportCardsGenerated(false);
        }}
        onGenerate={grading.loadWeightedGrade}
        onGenerateReportCards={grading.generateReportCards}
      />
    </>
  );
}
