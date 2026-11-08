import { z } from "zod";
export const announcementChannelSchema = z.enum(["EMAIL", "SMS", "WHATSAPP"]);
export type AnnouncementChannel = z.infer<typeof announcementChannelSchema>;
export const contactForChannel = (channel: AnnouncementChannel, raw: string | null | undefined) => channel === "EMAIL" ? (raw ?? "").trim().toLocaleLowerCase("en-US") : (raw ?? "").replace(/[\s().-]/g, "");
export function validChannelContact(channel: AnnouncementChannel, value: string) { return channel === "EMAIL" ? z.email().safeParse(value).success : /^\+[1-9]\d{7,14}$/.test(value); }
