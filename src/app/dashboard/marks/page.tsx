"use client";

import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MarksEntryTable } from "@/components/marks/MarksEntryTable";
import { Brain, Save, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function MarksPage() {
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const filtersSelected = selectedClass && selectedSubject && selectedExam;

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // API call to save all marks
      await new Promise((r) => setTimeout(r, 1000));
      toast.success("All marks saved successfully!");
    } catch {
      toast.error("Failed to save marks");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkGenerateRemarks = async () => {
    setIsGenerating(true);
    try {
      // API call to generate remarks for all students
      await new Promise((r) => setTimeout(r, 2000));
      toast.success("AI remarks generated for all students!");
    } catch {
      toast.error("Failed to generate remarks");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Header
        title="Marks Entry"
        description="Fast tabbing interface for entering student marks"
        actions={
          filtersSelected ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkGenerateRemarks}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4" />
                )}
                Bulk AI Remarks
              </Button>
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save All
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        {/* ─── Selectors ─────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Class
            </label>
            <Select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-48"
            >
              <option value="">Select Class</option>
              <option value="demo">Class 10-A (Demo)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Subject
            </label>
            <Select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-48"
            >
              <option value="">Select Subject</option>
              <option value="demo">Mathematics (Demo)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Exam
            </label>
            <Select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-48"
            >
              <option value="">Select Exam</option>
              <option value="demo">Final Term 2026 (Demo)</option>
            </Select>
          </div>
        </div>

        {/* ─── Marks Table ───────────────────────────────── */}
        {filtersSelected ? (
          <MarksEntryTable
            classId={selectedClass}
            subjectId={selectedSubject}
            examId={selectedExam}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Select Class, Subject & Exam</h3>
            <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
              Choose a class, subject, and exam above to start entering marks.
              AI remarks will be generated automatically as you type.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
