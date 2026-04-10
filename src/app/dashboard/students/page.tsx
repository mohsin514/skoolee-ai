"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, Upload, Search, MoreHorizontal } from "lucide-react";
import type { Student } from "@/types";

export default function StudentsPage() {
  const [students] = useState<Student[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <>
      <Header
        title="Students"
        description="Manage your school's student records"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4" />
              Bulk Import
            </Button>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Search & Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select className="w-40">
            <option value="">All Classes</option>
          </Select>
          <Select className="w-40">
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>

        {/* Students Table */}
        {students.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Plus className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No students yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first student or bulk import from a CSV file.
              </p>
              <div className="mt-6 flex gap-3">
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4" />
                  Add Student
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reg. No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Guardian</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-mono text-xs">
                    {student.registrationNo}
                  </TableCell>
                  <TableCell className="font-medium">
                    {student.firstName} {student.lastName}
                  </TableCell>
                  <TableCell>—</TableCell>
                  <TableCell className="text-muted-foreground">
                    {student.guardianName || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {student.guardianPhone || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        student.status === "ACTIVE" ? "success" : "secondary"
                      }
                    >
                      {student.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ─── Add Student Dialog ──────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
          </DialogHeader>
          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input placeholder="Ahmed" />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input placeholder="Khan" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Registration No. *</Label>
              <Input placeholder="STU-2026-001" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Guardian Name</Label>
                <Input placeholder="Muhammad Khan" />
              </div>
              <div className="space-y-2">
                <Label>Guardian WhatsApp</Label>
                <Input placeholder="+92 300 1234567" />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Add Student</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
