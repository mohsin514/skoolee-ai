import { z } from "zod";

export const workflowRetryReasons = ["TRANSIENT_FAILURE_RESOLVED", "CONFIGURATION_CORRECTED", "AUTHORIZATION_RESTORED"] as const;
export const workflowCancelReasons = ["NO_LONGER_REQUIRED", "INCORRECT_REQUEST", "INCIDENT_CONTAINMENT"] as const;
export type WorkflowOperationReason = (typeof workflowRetryReasons)[number] | (typeof workflowCancelReasons)[number];

/** Fixed reasons record operator intent without inviting pupil payloads into logs. */
export const workflowOperationSchema = z.discriminatedUnion("action", [
  z.strictObject({ schoolId: z.string().min(1).max(100), eventId: z.uuid(), action: z.literal("retry"), reason: z.enum(workflowRetryReasons) }),
  z.strictObject({ schoolId: z.string().min(1).max(100), eventId: z.uuid(), action: z.literal("cancel"), reason: z.enum(workflowCancelReasons) }),
]);
