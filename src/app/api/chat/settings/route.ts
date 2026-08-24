import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { requireChatUser } from "@/lib/chat/service";
import { prisma } from "@/lib/db/prisma";
import { canManageChatSettings, getChatSettings } from "@/lib/chat/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm");

const patchSchema = z.object({
  studentToStudent: z.boolean().optional(),
  parentToParent: z.boolean().optional(),
  studentToSupport: z.boolean().optional(),
  parentToSupport: z.boolean().optional(),
  attachmentsEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: timeString.optional(),
  quietHoursEnd: timeString.optional(),
});

/** Readable by anyone signed in — the client uses it to explain why a person
 *  is not in their directory. Only the flags, never anything identifying. */
export async function GET() {
  try {
    const user = await requireChatUser();
    const settings = await getChatSettings(user.schoolId);
    return Response.json({
      success: true,
      settings,
      canManage: canManageChatSettings(user.role),
    });
  } catch (error) {
    return errorResponse(error, "[chat] get settings failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireChatUser();
    if (!canManageChatSettings(user.role)) {
      throw new ApiError("Only school leadership can change messaging settings", 403);
    }

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    // Upsert rather than update: most schools have never opened this screen,
    // so the row does not exist until the first change is saved.
    const saved = await prisma.chatSetting.upsert({
      where: { schoolId: user.schoolId },
      create: { schoolId: user.schoolId, ...parsed.data },
      update: parsed.data,
    });

    return Response.json({ success: true, settings: saved });
  } catch (error) {
    return errorResponse(error, "[chat] update settings failed");
  }
}
