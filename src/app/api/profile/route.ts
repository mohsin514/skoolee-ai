import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { dashboardPathForRole, roleLabel } from "@/lib/roles";

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
  if (trimmed.length > 1_500_000) throw new ApiError("Profile image is too large", 413);
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
  throw new ApiError("Use an image upload, data image, or a valid image URL", 400);
}

function toProfile(user: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: any;
  profileImageUrl: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone || "",
    role: user.role,
    roleLabel: roleLabel(user.role),
    dashboardPath: dashboardPathForRole(user.role),
    profileImageUrl: user.profileImageUrl || "",
  };
}

export async function GET() {
  try {
    const session = await requireAuthUser();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        profileImageUrl: true,
      },
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
      select: { fullName: true },
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

    const user = await prisma.user.update({
      where: { id: session.userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        profileImageUrl: true,
      },
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
