"use client";

import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Send, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ReportsPage() {
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleBulkGenerate = async () => {
    if (!selectedClass || !selectedExam) {
      toast.error("Please select a class and exam first");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/reports/bulk-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass,
          examId: selectedExam,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Bulk PDF generation started! Job ID: ${data.data?.jobId}`);
      } else {
        toast.error(data.error || "Failed to start generation");
      }
    } catch {
      toast.error("Failed to start bulk generation");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Header
        title="Report Cards"
        description="Generate and send PDF report cards to parents"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Bulk Generate PDFs
            </Button>
            <Button variant="outline" size="sm">
              <Send className="h-4 w-4" />
              Send via WhatsApp
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="flex gap-4">
          <Select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-48"
          >
            <option value="">Select Class</option>
            <option value="demo">Class 10-A</option>
          </Select>
          <Select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
            className="w-48"
          >
            <option value="">Select Exam</option>
            <option value="demo">Final Term 2026</option>
          </Select>
        </div>

        {/* Empty state */}
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No report cards yet</h3>
            <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
              Select a class and exam above, then click &quot;Bulk Generate
              PDFs&quot; to create report cards for all students.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
