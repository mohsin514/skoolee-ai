import { z } from "zod";
const InviteProfileSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  cnic: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  qualification: z.string().optional(),
  specialization: z.string().optional(),
  subjectSpecialties: z.array(z.string()).optional(),
  teachesAllSubjects: z.boolean().optional(),
  experience: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  joiningDate: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  designation: z.string().optional(),
  contractType: z.enum(["PERMANENT", "CONTRACT", "PART_TIME"]).optional(),
  basicSalary: z.number().int().min(0).optional(),
  // Where this person will sit once they accept. Captured now because the
  // hiring decision already knows it — asking again after they sign in would
  // leave every new teacher unplaced in the chart until someone remembers.
  designationId: z.string().uuid().optional(),
  primaryDepartmentId: z.string().uuid().optional(),
  reportsToId: z.string().uuid().optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "VISITING", "ADJUNCT", "CONTRACT", "INTERN", "VOLUNTEER"])
    .optional(),
  employeeCode: z.string().optional(),
});

export const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().optional(),
  role: z.enum(['CAMPUS_ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'RECEPTIONIST', 'STUDENT', 'PARENT']),
  campusId: z.string().uuid().optional(),
  canPurchaseSubscription: z.boolean().optional(),
  canManageMemberships: z.boolean().optional(),
  profile: InviteProfileSchema.optional(),
});

export type StaffInvitationInput = z.infer<typeof InviteSchema>;
