export const GUARDIAN_PERMISSION_KEYS = ["learningRecords", "attendance", "finances", "communication", "pickup"] as const;
export const GUARDIAN_CONSENT_KEYS = ["medicalTreatment", "fieldTrips", "mediaPublication", "offsiteTravel"] as const;

export type GuardianPermission = typeof GUARDIAN_PERMISSION_KEYS[number] | typeof GUARDIAN_CONSENT_KEYS[number];
export type GuardianPermissions = Record<typeof GUARDIAN_PERMISSION_KEYS[number], boolean> & {
  consents: Record<typeof GUARDIAN_CONSENT_KEYS[number], boolean>;
};

export const EMPTY_GUARDIAN_PERMISSIONS: GuardianPermissions = {
  learningRecords: false,
  attendance: false,
  finances: false,
  communication: false,
  pickup: false,
  consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false },
};

/** Unknown, missing, or malformed rights always resolve to denied. */
export function parseGuardianPermissions(value: unknown): GuardianPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(EMPTY_GUARDIAN_PERMISSIONS);
  const raw = value as Record<string, unknown>;
  const consents = raw.consents && typeof raw.consents === "object" && !Array.isArray(raw.consents)
    ? raw.consents as Record<string, unknown>
    : {};
  return {
    learningRecords: raw.learningRecords === true,
    attendance: raw.attendance === true,
    finances: raw.finances === true,
    communication: raw.communication === true,
    pickup: raw.pickup === true,
    consents: {
      medicalTreatment: consents.medicalTreatment === true,
      fieldTrips: consents.fieldTrips === true,
      mediaPublication: consents.mediaPublication === true,
      offsiteTravel: consents.offsiteTravel === true,
    },
  };
}

export function hasGuardianPermission(permissions: unknown, permission: GuardianPermission): boolean {
  const parsed = parseGuardianPermissions(permissions);
  return permission in parsed.consents
    ? parsed.consents[permission as keyof GuardianPermissions["consents"]]
    : parsed[permission as keyof Omit<GuardianPermissions, "consents">];
}
