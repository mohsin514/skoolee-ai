"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface ClassRecord {
  id: string;
  name: string;
  section?: string | null;
  academicYear: number;
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassRecord[];
  defaultClassId: string;
  onSuccess: () => void;
}

interface ParsedRow {
  rowNum: number;
  data: Record<string, string>;
  student: StudentRow;
  errors: string[];
  isValid: boolean;
}

interface StudentRow {
  fullName: string;
  rollNo: string;
  classId: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  studentEmail: string;
  guardianName: string;
  guardianPhone: string;
  guardianWhatsapp: string;
  guardianEmail: string;
  address: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value) return value;
  }
  return "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateRow(student: StudentRow, rowNum: number): string[] {
  const errors: string[] = [];
  if (!student.fullName.trim()) errors.push("Name is required");
  if (!student.rollNo.trim()) errors.push("Roll number is required");
  if (!student.classId) errors.push("Class ID is required");
  if (student.guardianEmail && !isValidEmail(student.guardianEmail)) {
    errors.push("Invalid guardian email");
  }
  if (student.studentEmail && !isValidEmail(student.studentEmail)) {
    errors.push("Invalid student email");
  }
  return errors;
}

const CSV_TEMPLATE = `fullName,rollNo,gender,dateOfBirth,phone,studentEmail,guardianName,guardianPhone,guardianWhatsapp,guardianEmail,address
Ali Ahmed Khan,V-A-001,MALE,2010-03-15,+92 3001234567,ali@example.com,Ahmed Khan,+92 3001234567,,ahmed@example.com,123 Mosque Lane Lahore`;

export function BulkImportDialog({
  open,
  onOpenChange,
  classes,
  defaultClassId,
  onSuccess,
}: BulkImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    count: number;
    message: string;
  } | null>(null);

  const validRows = parsedRows.filter((r) => r.isValid);
  const errorRows = parsedRows.filter((r) => !r.isValid);

  const reset = () => {
    setFileName("");
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Only CSV files are accepted");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be under 5MB");
      return;
    }

    setFileName(file.name);
    setImportResult(null);

    file.text().then((text) => {
      try {
        const rows = parseCsv(text);
        const [headers, ...bodyRows] = rows;

        if (!headers || bodyRows.length === 0) {
          toast.error("CSV needs a header row and at least one student");
          return;
        }

        if (bodyRows.length > 1000) {
          toast.error("Maximum 1000 rows allowed per import");
          return;
        }

        const normalizedHeaders = headers.map(normalizeHeader);

        const parsed: ParsedRow[] = bodyRows.map((values, index) => {
          const row = normalizedHeaders.reduce<Record<string, string>>((acc, header, i) => {
            acc[header] = values[i] || "";
            return acc;
          }, {});

          const student: StudentRow = {
            fullName: pick(row, ["fullName", "studentName", "name"]),
            rollNo: pick(row, ["rollNo", "rollNumber", "registrationNo", "regNo"]),
            classId: pick(row, ["classId"]) || defaultClassId,
            gender: (pick(row, ["gender"]).toUpperCase() || "OTHER"),
            dateOfBirth: pick(row, ["dateOfBirth", "dob"]),
            phone: pick(row, ["phone", "studentPhone"]),
            studentEmail: pick(row, ["studentEmail", "studentLoginEmail", "email"]),
            guardianName: pick(row, ["guardianName", "parentName"]),
            guardianPhone: pick(row, ["guardianPhone", "parentPhone"]),
            guardianWhatsapp: pick(row, ["guardianWhatsapp", "whatsapp"]),
            guardianEmail: pick(row, ["guardianEmail", "parentEmail"]),
            address: pick(row, ["address"]),
          };

          const errors = validateRow(student, index + 2);

          return {
            rowNum: index + 2,
            data: row,
            student,
            errors,
            isValid: errors.length === 0,
          };
        });

        setParsedRows(parsed);
      } catch {
        toast.error("Could not parse CSV file");
      }
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "student_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const confirmImport = async () => {
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setIsImporting(true);
    try {
      const students = validRows.map((r) => ({
        ...r.student,
        studentEmail: r.student.studentEmail || null,
        guardianEmail: r.student.guardianEmail || null,
      }));

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Import failed");

      setImportResult({
        success: true,
        count: Array.isArray(data.data) ? data.data.length : 1,
        message: data.message || `${validRows.length} students imported`,
      });

      toast.success(data.message || "Students imported successfully");
      if (data.guardianInviteFailures?.length) {
        toast.warning("Some guardian invite emails could not be sent.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
      setImportResult({
        success: false,
        count: 0,
        message: error instanceof Error ? error.message : "Import failed",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (importResult?.success) {
      onSuccess();
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#8127cf]" />
            Bulk Student Import
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to import multiple students at once.
          </DialogDescription>
        </DialogHeader>

        <div className="sk-rise space-y-4" style={{ animationDelay: "60ms" }}>
          {/* Import Result */}
          {importResult && (
            <div
              className={`flex items-center gap-3 rounded-2xl p-4 ${
                importResult.success
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {importResult.success ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}
              <div>
                <p className="font-black">{importResult.success ? "Import Complete" : "Import Failed"}</p>
                <p className="text-sm font-semibold">{importResult.message}</p>
              </div>
            </div>
          )}

          {!importResult && (
            <>
              {/* File Upload */}
              <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#cfc2d6]/30 bg-[#fbf0fe]/30 p-6 transition-colors hover:border-[#8127cf]/30">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {fileName ? (
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-[#8127cf]" />
                    <span className="font-bold text-[#1f1a23]">{fileName}</span>
                    <button
                      type="button"
                      className="rounded-lg p-1 text-ink-subtle hover:bg-[#fbf0fe] hover:text-rose-500"
                      onClick={reset}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-[#8127cf]/50" />
                    <p className="text-sm font-bold text-ink">
                      Drop your CSV file here or click to browse
                    </p>
                  </>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {fileName ? "Choose Different File" : "Choose CSV File"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={downloadTemplate}
                  >
                    <Download className="h-4 w-4" />
                    Download Template
                  </Button>
                </div>
              </div>

              {/* Validation Results */}
              {parsedRows.length > 0 && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs font-black text-emerald-700">
                        {validRows.length} valid
                      </span>
                    </div>
                    {errorRows.length > 0 && (
                      <div className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                        <span className="text-xs font-black text-rose-700">
                          {errorRows.length} errors
                        </span>
                      </div>
                    )}
                    <span className="text-xs font-semibold text-ink-muted">
                      {parsedRows.length} total rows
                    </span>
                  </div>

                  {/* Error Preview */}
                  {errorRows.length > 0 && (
                    <div className="rounded-2xl border border-rose-200/50 bg-rose-50/50 p-3">
                      <p className="mb-2 text-xs font-black text-rose-700">
                        Rows with errors (will be skipped):
                      </p>
                      <div className="space-y-1">
                        {errorRows.slice(0, 5).map((row) => (
                          <div
                            key={row.rowNum}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Badge variant="destructive" className="shrink-0 text-[10px]">
                              Row {row.rowNum}
                            </Badge>
                            <span className="truncate text-rose-600">
                              {row.errors.join("; ")}
                            </span>
                          </div>
                        ))}
                        {errorRows.length > 5 && (
                          <p className="text-xs font-semibold text-rose-500">
                            ...and {errorRows.length - 5} more errors
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preview Table */}
                  <div className="max-h-64 overflow-auto rounded-2xl border border-[#cfc2d6]/15">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Row</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Roll No</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Guardian</TableHead>
                          <TableHead className="w-20 text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.slice(0, 10).map((row) => (
                          <TableRow key={row.rowNum}>
                            <TableCell className="font-mono text-xs">
                              {row.rowNum}
                            </TableCell>
                            <TableCell className="font-medium">
                              {row.student.fullName || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.student.rollNo || "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.student.gender || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.student.guardianName || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.isValid ? (
                                <Badge variant="success" className="text-[10px]">
                                  Valid
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">
                                  Error
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {parsedRows.length > 10 && (
                      <div className="border-t border-[#cfc2d6]/15 bg-[#fbf0fe]/30 px-4 py-2 text-center text-xs font-semibold text-ink-muted">
                        Showing first 10 of {parsedRows.length} rows
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {importResult?.success ? "Done" : "Cancel"}
          </Button>
          {!importResult && parsedRows.length > 0 && (
            <Button
              type="button"
              onClick={confirmImport}
              disabled={isImporting || validRows.length === 0}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Import {validRows.length} Students
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
