import { z } from "zod";

const optionalText = z.string().nullable().optional();
const blank = z.literal("");

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;

/** SKAI-164: a blank value clears the field; anything else must be a real address, never silently stored. */
const guardianEmail = z.union([z.string().trim().email("Enter a valid guardian email address"), blank]).nullish();

/** SKAI-164: a pupil's date of birth is a real calendar date that is not in the future. */
const dateOfBirth = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Date of birth must be a date").refine((value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && time <= Date.now();
  }, "Date of birth cannot be in the future"),
  blank,
]).nullish();

/** The single-pupil edit contract. Unknown UI metadata is ignored; editable values are validated. */
export const studentProfileUpdateSchema = z.object({
  id: z.string().min(1, "Student id is required"),
  campusId: optionalText,
  classId: z.string().optional(),
  fullName: z.string().min(1, "Student name is required").optional(),
  rollNo: z.string().min(1, "Roll number is required").optional(),
  nameUr: optionalText,
  phone: optionalText,
  guardianName: optionalText,
  guardianNameUr: optionalText,
  guardianPhone: optionalText,
  guardianWhatsapp: optionalText,
  guardianEmail,
  guardianRelationship: optionalText,
  guardianOccupation: optionalText,
  profileImageUrl: optionalText,
  address: optionalText,
  city: optionalText,
  province: optionalText,
  postalCode: optionalText,
  medicalNotes: optionalText,
  specialNeeds: optionalText,
  allergies: optionalText,
  medications: optionalText,
  previousSchool: optionalText,
  nationality: optionalText,
  // SKAI-1149: validated and normalised in the route (src/lib/identity/regulator-ids.ts).
  emiratesId: optionalText,
  regulatorId: optionalText,
  gender: z.union([z.enum(["MALE", "FEMALE", "OTHER"]), z.literal("")]).nullish(),
  // SKAI-164: an unknown blood type is refused (it used to be dropped), and blank clears it.
  bloodType: z.union([z.enum(BLOOD_TYPES), blank]).nullish(),
  status: optionalText,
  dateOfBirth,
  categoryId: optionalText,
  groupId: optionalText,
  siblingStudentId: optionalText,
  siblingGroupId: optionalText,
  expectedValues: z.record(z.string(), z.string().nullable()).nullish(),
});
