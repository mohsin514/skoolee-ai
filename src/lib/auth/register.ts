import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { createVerificationToken } from "@/lib/auth/verification";
import { Prisma } from "@prisma/client";
import { sendExistingAccountNotice, sendVerificationEmail } from "@/lib/email";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { countrySchema, currencyForCountry } from "@/lib/locale/country";
import { billingCountry, WORLD_COUNTRIES } from "@/lib/locale/world-countries";
import { createPlanContract } from "@/config/commercial-contract";
import { resetPasswordProblem } from "@/lib/auth/reset-password-policy";

export const SignupStep1Schema = z.object({
  email: z.string().email(),
  registrationType: z.enum(["school_group", "single_campus"]),
});

export const SignupStep2Schema = z.object({
  email: z.string().email("Invalid work email address"),
  fullName: z.string().min(3, "Please enter your full name"),
  // SKAI-81: the same policy the form checklist shows, so a direct API call cannot set a weaker one.
  password: z.string().superRefine((value, ctx) => {
    const problem = resetPasswordProblem(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
  schoolName: z.string().min(3, "Institution name is required"),
  regId: z.string().min(3, "Unique identity code is required"),
  regIdMode: z.enum(["auto", "manual"]).default("auto"),
  // Captured at signup so the owner's account is reachable from day one:
  // it lands on the user record (staff directory, profile) and doubles as the
  // school's first contact number until onboarding overrides it.
  phone: z.string().trim().min(7, "Enter a valid phone number").optional().or(z.literal("")),
  country: countrySchema.default("PK"),
  /** The exact country (ISO 3166-1 alpha-2); `country` is only its billing market. Drives boards, dial codes and time zones. */
  countryIso: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  language: z.enum(["en", "ar", "ur"]).optional(),
}).superRefine((value, ctx) => {
  if (!value.countryIso) return;
  if (!WORLD_COUNTRIES.some(([iso]) => iso === value.countryIso)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["countryIso"], message: "Choose a supported country." });
    return;
  }
  const expectedBillingCountry = billingCountry(value.countryIso);
  if (value.country !== expectedBillingCountry) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["countryIso"], message: "Country metadata does not match the selected billing country." });
  }
});

// One wording for a new and an existing address when the email cannot be sent (SKO-457).
const REG_ID_TAKEN = "This Identity Code (Reg ID) is already registered.";
const DELIVERY_WARNING = "We could not send the email just now. Request a new verification link from the sign-in page.";

export type SignupStep1Input = z.infer<typeof SignupStep1Schema>;
export type SignupStep2Input = z.infer<typeof SignupStep2Schema>;

export type SignupResult =
  | { success: true; warning?: string; user?: { id: string; email: string } }
  | { success: false; error: string; code?: SignupErrorCode };

/** Stable codes the register page localizes (SKAI-81); `error` stays as the English fallback. */
export type SignupErrorCode = "reg_id_taken" | "step1_missing" | "duplicate";

function schoolSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${base || "school"}-${randomUUID().slice(0, 8)}`;
}

export function signupError(error: unknown, fallback = "Registration failed") {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export async function saveSignupStep1(data: SignupStep1Input): Promise<SignupResult> {
  const valid = SignupStep1Schema.parse(data);

  // Self-serve signup runs before any school exists, so there is no tenant
  // to scope to. Everything touched here is keyed by the applicant's email.
  return runUnscoped("signup step 1: no school exists yet", async () => {

    const existing = await prisma.pendingRegistration.findFirst({
      where: { email: valid.email },
    });

    if (existing) {
      await prisma.pendingRegistration.update({
        where: { id: existing.id },
        data: { registrationType: valid.registrationType },
      });
    } else {
      await prisma.pendingRegistration.create({
        data: {
          email: valid.email,
          registrationType: valid.registrationType,
        },
      });
    }

    return { success: true };
  });
}

export async function completeSignupStep2(data: SignupStep2Input): Promise<SignupResult> {
  const valid = SignupStep2Schema.parse(data);

  // This call creates the school, so it necessarily runs before a tenant
  // exists. Uniqueness checks below are platform-wide by design.
  return runUnscoped("signup step 2: creates the school itself", () =>
    createSchoolAndOwner(valid)
  );
}

async function createSchoolAndOwner(valid: SignupStep2Input): Promise<SignupResult> {
  const pending = await prisma.pendingRegistration.findUnique({
    where: { email: valid.email },
  });

  if (!pending) {
    return { success: false, code: "step1_missing", error: "Step 1 not completed. Please restart registration." };
  }

  // FINDING-D: no global account check — identity is tenant-scoped and the
  // school being registered does not exist yet.
  const [existingSchoolByRegId, existingSchoolByEmail] = await Promise.all([
    prisma.school.findUnique({ where: { regId: valid.regId } }),
    prisma.school.findUnique({ where: { contactEmail: valid.email } }),
  ]);
  if (existingSchoolByRegId) return { success: false, code: "reg_id_taken", error: REG_ID_TAKEN };
  // SKO-457: an address that already owns a school is answered exactly like a new one; the owner
  // is told by email instead, so the signup screen never confirms which addresses have accounts.
  if (existingSchoolByEmail) return existingAddressOutcome(valid);

  const hashedPassword = await bcrypt.hash(valid.password, 10);
  const role = pending.registrationType === "school_group" ? "SUPER_ADMIN" : "ADMIN";

  // SKAI-81: one batched transaction (a single round trip) instead of an interactive
  // one. Against a remote database, four sequential awaits inside an interactive
  // transaction ran past its 5 s timeout and failed signups. Ids are minted here so
  // the rows can reference each other without reading back.
  const phone = valid.phone?.trim() || null;
  const schoolId = randomUUID();
  const user = { id: randomUUID(), email: valid.email };
  try {
    await prisma.$transaction([
      prisma.school.create({
        data: {
          id: schoolId,
          name: valid.schoolName,
          registrationKind: pending.registrationType === "school_group" ? "GROUP" : "STANDALONE",
          regId: valid.regId,
          registrationIdMode: valid.regIdMode,
          slug: schoolSlug(valid.schoolName),
          contactEmail: valid.email,
          phone,
          city: "",
          status: "TRIAL",
          commercialContract: createPlanContract("FREE"),
        },
      }),
      prisma.user.create({
        data: {
          id: user.id,
          email: valid.email,
          password: hashedPassword,
          fullName: valid.fullName,
          preferredLanguage: valid.language ?? "en",
          phone,
          role,
          isInstitutionOwner: true,
          canPurchaseSubscription: true,
          canManageMemberships: true,
          schoolId,
          onboardingComplete: false,
          isActive: false,
        },
      }),
      prisma.localePolicy.create({
        data: {
          schoolId,
          scopeKey: "school",
          settings: { country: valid.country, countryIso: valid.countryIso ?? (valid.country === "OTHER" ? undefined : valid.country), currency: currencyForCountry(valid.country) },
          effectiveAt: new Date(),
          createdBy: user.id,
        },
      }),
      prisma.pendingRegistration.delete({ where: { email: valid.email } }),
    ]);
  } catch (error) {
    // A concurrent signup took this contact email or Reg ID between the check and the commit.
    const target = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? String(error.meta?.target ?? "") : "";
    if (target.includes("contact_email") || target.includes("contactEmail")) return existingAddressOutcome(valid);
    if (target.includes("reg_id") || target.includes("regId")) return { success: false, code: "reg_id_taken", error: REG_ID_TAKEN };
    throw error;
  }

  // Signed, expiring, and bound to this user — the link is the only thing
  // /api/auth/verify will accept.
  const token = await createVerificationToken(user.id);
  try {
    const delivery = await sendVerificationEmail(user.email, user.id, token, valid.language);
    if ("bypass" in delivery && delivery.bypass && process.env.NODE_ENV !== "production") {
      return {
        success: true,
        warning: `Email delivery is disabled in development. Verify your account here: ${
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/verify?token=${token}`
        }`,
        user: { id: user.id, email: user.email },
      };
    }
  } catch (error) {
    console.error("[signup-email]", error);
    return {
      success: true,
      warning: DELIVERY_WARNING,
      user: { id: user.id, email: user.email },
    };
  }

  return { success: true, user: { id: user.id, email: user.email } };
}

/** The "new address" outcome for an address that already owns a school, plus a notice to its owner. */
async function existingAddressOutcome(valid: SignupStep2Input): Promise<SignupResult> {
  // Comparable work to a real signup: hash the password and attempt one delivery.
  await bcrypt.hash(valid.password, 10);
  await prisma.pendingRegistration.deleteMany({ where: { email: valid.email } });
  if ((await authRateLimit(`signup-existing:${valid.email.toLowerCase()}`, { limit: 3, windowMs: 3_600_000 })).ok) {
    try {
      await sendExistingAccountNotice(valid.email);
    } catch {
      console.warn("[signup-existing] notice delivery failed");
      return { success: true, warning: DELIVERY_WARNING };
    }
  }
  return { success: true };
}
