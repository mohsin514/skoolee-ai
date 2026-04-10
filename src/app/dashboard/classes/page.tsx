"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, GraduationCap, Users } from "lucide-react";
import type { Class } from "@/types";

export default function ClassesPage() {
  const [classes] = useState<Class[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <>
      <Header
        title="Classes"
        description="Manage classes, sections, and subject assignments"
        actions={
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
            Add Class
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {classes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No classes yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first class to start organizing students.
              </p>
              <Button
                size="sm"
                className="mt-6"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-4 w-4" />
                Create Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class Name</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Grade Level</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Capacity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((cls) => (
                <TableRow key={cls.id}>
                  <TableCell className="font-medium">{cls.name}</TableCell>
                  <TableCell>{cls.section || "—"}</TableCell>
                  <TableCell>{cls.gradeLevel}</TableCell>
                  <TableCell>{cls.academicYear}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />0
                    </div>
                  </TableCell>
                  <TableCell>{cls.capacity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ─── Add Class Dialog ────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Class</DialogTitle>
          </DialogHeader>
          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class Name *</Label>
                <Input placeholder="Class 10" />
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Input placeholder="A" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grade Level *</Label>
                <Input type="number" placeholder="10" min={1} max={12} />
              </div>
              <div className="space-y-2">
                <Label>Academic Year *</Label>
                <Input placeholder="2025-2026" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input type="number" placeholder="40" />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create Class</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
