import { requireAuthUser, requirePlatformOwner } from "@/lib/api/scope";
export async function requireAutomaticUser() {
 const user = await requireAuthUser({ allowSuspended: true });
 return user.role === "APP_OWNER" ? requirePlatformOwner() : requireAuthUser();
}
