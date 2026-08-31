import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";
import { deleteFile } from "@/lib/storage/s3";

function cleanOptionalText(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanProfileImage(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^profile-images\/\S+$/i.test(trimmed)) return trimmed;
  if (trimmed.length > 1_500_000) throw new ApiError("Profile image is too large", 413);
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
  throw new ApiError("Use an image upload, data image, or a valid image URL", 400);
}

function isS3Key(value: string | null): value is string {
  return !!value && value.startsWith("profile-images/");
}

/**
 * Everything the profile card reads. Kept as one constant so GET and PATCH
 * can never select different shapes and hand `toProfile` a half-filled user.
 *
 * The professional block is what teacher onboarding collects. Without it the
 * card showed a name and a phone number and nothing a teacher had just spent
 * three screens entering.
 */
const PROFILE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  profileImageUrl: true,
  qualification: true,
  specialization: true,
  subjectSpecialties: true,
  teachesAllSubjects: true,
  experience: true,
  joiningDate: true,
  city: true,
} as const;

type ProfileUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  profileImageUrl: string | null;
  qualification: string | null;
  specialization: string | null;
  subjectSpecialties: string[];
  teachesAllSubjects: boolean;
  experience: string | null;
  joiningDate: Date | null;
  city: string | null;
};

function toProfile(user: ProfileUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone || "",
    role: user.role,
    roleLabel: roleLabel(user.role),
    dashboardPath: dashboardPathForRole(user.role),
    profileImageUrl: user.profileImageUrl || "",
    qualification: user.qualification || "",
    // A generalist has no specialty list by design, so say so in words rather
    // than rendering an empty row.
    specialization: user.teachesAllSubjects ? "All subjects" : user.specialization || "",
    subjectSpecialties: user.subjectSpecialties ?? [],
    teachesAllSubjects: user.teachesAllSubjects,
    experience: user.experience || "",
    joiningDate: user.joiningDate ? user.joiningDate.toISOString().slice(0, 10) : "",
    city: user.city || "",
  };
}

export async function GET() {
  try {
    const session = await requireAuthUser();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: PROFILE_SELECT,
    });

    if (!user) throw new ApiError("Profile not found", 404);
    return Response.json({ success: true, profile: toProfile(user) });
  } catch (error) {
    return errorResponse(error, "[profile] GET failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuthUser();
    const body = await req.json();
    const currentUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { fullName: true, profileImageUrl: true },
    });
    const data: {
      fullName?: string;
      phone?: string | null;
      profileImageUrl?: string | null;
    } = {};

    if (body.fullName !== undefined) {
      const fullName = cleanOptionalText(body.fullName);
      if (!fullName || fullName.length < 2) throw new ApiError("Full name must be at least 2 characters", 400);
      data.fullName = fullName;
    }

    if (body.phone !== undefined) {
      data.phone = cleanOptionalText(body.phone);
    }

    if (body.profileImageUrl !== undefined) {
      data.profileImageUrl = cleanProfileImage(body.profileImageUrl);
    }

    if (data.profileImageUrl !== undefined) {
      const prevImage = currentUser?.profileImageUrl ?? null;
      if (isS3Key(prevImage) && prevImage !== data.profileImageUrl) {
        void deleteFile(prevImage).catch(() => { });
      }
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data,
      select: PROFILE_SELECT,
    });

    if (session.role === "STUDENT" && currentUser?.fullName && Object.keys(data).length > 0) {
      await prisma.student.updateMany({
        where: {
          fullName: currentUser.fullName,
          campus: { schoolId: session.schoolId },
          ...(session.campusId ? { campusId: session.campusId } : {}),
        },
        data: {
          ...(data.fullName !== undefined ? { fullName: user.fullName } : {}),
          ...(data.phone !== undefined ? { phone: user.phone } : {}),
          ...(data.profileImageUrl !== undefined ? { profileImageUrl: user.profileImageUrl } : {}),
        },
      });
    }

    return Response.json({ success: true, profile: toProfile(user) });
  } catch (error) {
    return errorResponse(error, "[profile] PATCH failed");
  }
}
