// Regions a school can be planned into, and which services can actually be
// placed there. This is an engineering capability matrix, not a legal or
// compliance statement: a location only counts as "verified" once platform
// evidence is recorded (DataServiceVerification), and commercial claims need
// qualified review on top of that.

export const DATA_REGIONS = {
  "ap-south-1": "Asia Pacific (Mumbai)",
  "me-central-1": "Middle East (UAE)",
  "eu-central-1": "Europe (Frankfurt)",
  "us-east-1": "United States (N. Virginia)",
} as const;
export type DataRegion = keyof typeof DATA_REGIONS;

export const DATA_SERVICES = ["database", "backups", "files", "ai", "email", "whatsapp", "sms", "support"] as const;
export type DataService = typeof DATA_SERVICES[number];

/**
 * Regions each service can be pinned to with the integrations this codebase uses.
 * An empty list means the provider decides where processing happens, so no
 * regional placement can be promised for that service.
 */
export const SERVICE_REGION_SUPPORT: Record<DataService, readonly DataRegion[]> = {
  database: ["ap-south-1", "eu-central-1", "us-east-1"],
  backups: ["ap-south-1", "eu-central-1", "us-east-1"], // provider backups follow the database project region
  files: ["ap-south-1", "me-central-1", "eu-central-1", "us-east-1"],
  ai: [], // contracted API provider; a loopback Ollama is reported as local processing instead
  email: [],
  whatsapp: [],
  sms: [],
  support: [], // vendor operators act through audited, time-bounded grants (SKO-390), not a hosting region
};

/** Services a school cannot operate without; a plan that cannot place them is blocked. */
export const REQUIRED_SERVICES: readonly DataService[] = ["database", "backups", "files"];
