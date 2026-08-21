import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { createVerificationToken } from "@/lib/auth/verification";
import { sendVerificationEmail } from "@/lib/email";

export const SignupStep1Schema = z.object({
  email: z.string().email(),
  registrationType: z.enum(["school_group", "single_campus"]),
});

export const SignupStep2Schema = z.object({
  email: z.string().email("Invalid work email address"),
  fullName: z.string().min(3, "Please enter your full name"),
  password: z.string().min(8, "Minimum 8 characters"),
  schoolName: z.string().min(3, "Institution name is required"),
  regId: z.string().min(3, "Unique identity code is required"),
});

export type SignupStep1Input = z.infer<typeof SignupStep1Schema>;
export type SignupStep2Input = z.infer<typeof SignupStep2Schema>;

export type SignupResult =
  | { success: true; warning?: string; user?: { id: string; email: string } }
  | { success: false; error: string };

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
    return { success: false, error: "Step 1 not completed. Please restart registration." };
  }

  // FINDING-D: no global account check — identity is tenant-scoped and the
  // school being registered does not exist yet.
  const [existingSchoolByRegId, existingSchoolByEmail] = await Promise.all([
    prisma.school.findUnique({ where: { regId: valid.regId } }),
    prisma.school.findUnique({ where: { contactEmail: valid.email } }),
  ]);
  if (existingSchoolByRegId) return { success: false, error: "This Identity Code (Reg ID) is already registered." };
  if (existingSchoolByEmail) return { success: false, error: "This email is already registered to a school." };

  const hashedPassword = await bcrypt.hash(valid.password, 10);
  const role = pending.registrationType === "school_group" ? "SUPER_ADMIN" : "ADMIN";

  const user = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name: valid.schoolName,
        regId: valid.regId,
        slug: schoolSlug(valid.schoolName),
        contactEmail: valid.email,
        city: "",
        status: "TRIAL",
      },
    });

    const createdUser = await tx.user.create({
      data: {
        email: valid.email,
        password: hashedPassword,
        fullName: valid.fullName,
        role,
        schoolId: school.id,
        onboardingComplete: false,
        isActive: false,
      },
    });

    await tx.pendingRegistration.delete({ where: { email: valid.email } });

    return createdUser;
  });

  // Signed, expiring, and bound to this user — the link is the only thing
  // /api/auth/verify will accept.
  const token = await createVerificationToken(user.id);
  try {
    const delivery = await sendVerificationEmail(user.email, user.id, token);
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
      warning: "Account created, but the verification email could not be sent. Please contact support or try password reset from the login page.",
      user: { id: user.id, email: user.email },
    };
  }

  return { success: true, user: { id: user.id, email: user.email } };
}
