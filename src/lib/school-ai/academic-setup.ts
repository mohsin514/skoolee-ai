import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Enter a real calendar date.");
export const normalizeAcademicName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const academicClassIdentity = (name: string, section: string | null) => JSON.stringify([normalizeAcademicName(name).toLocaleLowerCase("en"), section ? normalizeAcademicName(section).toLocaleLowerCase("en") : null]);

/** A reviewed operation is typed data, never an instruction parsed from generated prose. */
export const academicSetupProposalSchema = z.strictObject({
  operation: z.literal("academics.setup_year"),
  existingCycleId: id.optional(),
  academicYear: z.number().int().min(2000).max(2100),
  label: z.string().trim().min(1).max(120),
  startDate: date.nullable(),
  endDate: date.nullable(),
  classes: z.array(z.strictObject({
    id,
    name: z.string().trim().min(1).max(80),
    section: z.string().trim().min(1).max(40).nullable(),
    teachingMode: z.enum(["SINGLE", "SUBJECT"]),
  })).min(1).max(50),
}).superRefine((value, context) => {
  if (!value.existingCycleId && Boolean(value.startDate) !== Boolean(value.endDate)) context.addIssue({ code: "custom", path: ["endDate"], message: "Supply both planned dates, or leave both unset." });
  if (value.startDate && value.endDate && value.startDate > value.endDate) context.addIssue({ code: "custom", path: ["endDate"], message: "The end date must follow the start date." });
  for (const field of ["startDate", "endDate"] as const) {
    const year = Number(value[field]?.slice(0, 4));
    if (value[field] && (year < value.academicYear - 1 || year > value.academicYear + 1)) context.addIssue({ code: "custom", path: [field], message: "Planned dates must fall within the year before, during, or after the named academic year." });
  }
  if (new Set(value.classes.map(item => item.id)).size !== value.classes.length) context.addIssue({ code: "custom", path: ["classes"], message: "Class proposal IDs must be unique." });
  if (new Set(value.classes.map(item => academicClassIdentity(item.name, item.section))).size !== value.classes.length) context.addIssue({ code: "custom", path: ["classes"], message: "Each class name and section must be unique." });
});
export type AcademicSetupProposal = z.infer<typeof academicSetupProposalSchema>;
export interface AcademicSetupPreview {
  operation: "academics.setup_year";
  recordId: string;
  version: number;
  campusId: string;
  academicYear: number;
  cycle: { action: "CREATE" | "KEEP"; id: string | null; label: string; startDate: string | null; endDate: string | null; status: "DRAFT" | "ACTIVE" };
  willCreate: Array<{ proposalClassId: string; name: string; section: string | null; teachingMode: "SINGLE" | "SUBJECT" }>;
  willKeep: Array<{ proposalClassId: string; classId: string; name: string; section: string | null; teachingMode: "SINGLE" | "SUBJECT" }>;
  previewHash: string;
}
export interface AcademicSetupExecutionReceipt {
  id: string;
  operation: "academics.setup_year";
  recordId: string;
  version: number;
  status: "COMPLETED";
  createdCount: number;
  keptCount: number;
  cycleId: string;
  cycleCreated: boolean;
  classIds: string[];
  completedAt: string;
}
