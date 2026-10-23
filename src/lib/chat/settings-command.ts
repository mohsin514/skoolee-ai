import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { canManageChatSettings } from "@/lib/chat/policy";

/**
 * Change the school's messaging policy (PATCH /api/chat/settings), extracted so the route and the AI Workflows
 * `chat.update_school_settings` capability run the same command. Only the institution authority may change it
 * (the group's super admin, or a standalone school's admin). The fields are absolute values, so repeating a
 * change is harmless.
 */
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm");

export const chatSettingsPatchSchema = z.object({
  studentToStudent: z.boolean().optional(),
  parentToParent: z.boolean().optional(),
  studentToSupport: z.boolean().optional(),
  parentToSupport: z.boolean().optional(),
  attachmentsEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: timeString.optional(),
  quietHoursEnd: timeString.optional(),
});
export type ChatSettingsPatch = z.infer<typeof chatSettingsPatchSchema>;

/** The route's guard, run before the body is read. */
export function assertChatSettingsManager(user: AuthUser) {
  if (!canManageChatSettings(user)) {
    throw new ApiError("Only the institution administrator can change the messaging policy.", 403);
  }
}

export async function updateChatSettings(user: AuthUser, raw: unknown) {
  assertChatSettingsManager(user);
  const parsed = chatSettingsPatchSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  // Upsert rather than update: most schools have never opened this screen,
  // so the row does not exist until the first change is saved.
  return prisma.chatSetting.upsert({
    where: { schoolId: user.schoolId },
    create: { schoolId: user.schoolId, ...parsed.data },
    update: parsed.data,
  });
}
