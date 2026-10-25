import { z } from "zod";
export const campusCreateSchema = z.strictObject({ name: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(120), address: z.string().trim().max(300).optional(), phone: z.string().trim().max(30).optional() });
export const libraryCreateSchema = z.strictObject({ books: z.array(z.strictObject({ title: z.string().trim().min(1).max(200), author: z.string().trim().max(160).optional(), isbn: z.string().trim().max(40).optional(), subject: z.string().trim().max(120).optional(), copiesTotal: z.number().int().min(0).max(10000) })).min(1).max(100) });
export const phoneCallSchema = z.strictObject({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(6).max(30), direction: z.enum(["IN", "OUT"]), date: z.string().min(10).max(25), purpose: z.string().trim().min(2).max(120), note: z.string().trim().max(1000).optional(), sensitive: z.boolean() });
export const personalPlanSchema = z.strictObject({ title: z.string().trim().min(2).max(180), goal: z.string().trim().min(2).max(2000), steps: z.array(z.strictObject({ title: z.string().trim().min(2).max(300), detail: z.string().trim().max(2000), dueDate: z.string().date().nullable() })).min(1).max(30) });
export const studentsCreateSchema = z.strictObject({ students: z.array(z.strictObject({ fullName: z.string().trim().min(2).max(120), rollNo: z.string().trim().min(1).max(50), classId: z.string().min(1).max(128), gender: z.enum(["MALE", "FEMALE", "OTHER"]), guardianPhone: z.string().trim().min(6).max(30), guardianName: z.string().trim().max(120).optional(), guardianEmail: z.string().email().optional(), dateOfBirth: z.string().date().optional(), address: z.string().trim().min(1).max(300), city: z.string().trim().min(1).max(120), medicalNotes: z.string().trim().min(1).max(1000) })).min(1).max(100) });
export const platformInspectSchema = z.strictObject({ search: z.string().trim().max(120).describe("An institution name only. Do not put filter instructions such as missing city here.").optional(), missingCity: z.boolean().describe("True to list institutions whose city has not been recorded. Omit search unless a school name was also supplied.").optional() });
export const platformUpdateSchema = z.strictObject({ schoolId: z.string().min(1).max(128), name: z.string().trim().min(2).max(120).optional(), city: z.string().trim().min(2).max(120).optional(), website: z.string().url().max(300).optional() }).refine(value => Boolean(value.name || value.city || value.website), "Provide at least one profile field.");
export const profileActionSchema = z.strictObject({ fullName: z.string().trim().min(2).max(120).optional(), preferredLanguage: z.enum(["en", "ar", "ur"]).optional(), city: z.string().trim().max(120).optional(), qualification: z.string().trim().max(200).optional(), specialization: z.string().trim().max(200).optional(), subjectSpecialties: z.array(z.string().trim().min(1).max(100)).max(30).optional(), experience: z.string().trim().max(100).optional() }).refine(value => Object.keys(value).length > 0, "Provide at least one profile field.");

/** The adapters behind today's tool entries (moved from the retired automation engine). */
export type ToolAction =
 | { tool: "platform.inspect"; title: string; data: z.infer<typeof platformInspectSchema> }
 | { tool: "platform.update_institution"; title: string; data: z.infer<typeof platformUpdateSchema> }
 | { tool: "students.create"; title: string; data: z.infer<typeof studentsCreateSchema> }
 | { tool: "campus.create"; title: string; data: z.infer<typeof campusCreateSchema> }
 | { tool: "library.create_books"; title: string; data: z.infer<typeof libraryCreateSchema> }
 | { tool: "front_desk.log_call"; title: string; data: z.infer<typeof phoneCallSchema> }
 | { tool: "personal.save_plan"; title: string; data: z.infer<typeof personalPlanSchema> }
 | { tool: "profile.update"; title: string; data: z.infer<typeof profileActionSchema> };
