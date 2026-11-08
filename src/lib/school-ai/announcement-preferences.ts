import { z } from "zod";
import { announcementChannelSchema } from "./announcement-channel-contract";
export const channelPreferenceInputSchema = z.strictObject({ campusId: z.string().min(1).max(128), guardianUserId: z.string().min(1).max(128), channel: announcementChannelSchema, recipient: z.string().max(254), enabled: z.boolean(), expectedVersion: z.number().int().min(0), verified: z.boolean(), consent: z.boolean(), evidence: z.string().trim().min(10).max(1000) });
export type ChannelPreferenceInput = z.infer<typeof channelPreferenceInputSchema>;
export type ChannelPreferenceView = { campusId: string; campusName: string; guardianUserId: string; guardianName: string; contacts: { email: string[]; phone: string[] }; preferences: Array<{ channel: "EMAIL" | "SMS" | "WHATSAPP"; recipient: string; enabled: boolean; verified: boolean; consent: boolean; version: number; updatedAt: string }>; canVerify: boolean };
