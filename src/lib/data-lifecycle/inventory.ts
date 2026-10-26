import { DATA_REGIONS, DATA_SERVICES, REQUIRED_SERVICES, SERVICE_REGION_SUPPORT, type DataRegion, type DataService } from "@/config/data-regions";

export type PlacementState = "verified" | "configured" | "unsupported" | "not_configured";

export interface ServicePlacement {
  service: DataService;
  provider: string;
  location: string | null;      // region id, "local", or null when the provider decides
  state: PlacementState;
  note: string;
  evidence: { verifiedAt: string; expiresAt: string } | null;
}

export interface ServiceVerification { service: string; region: string; verifiedAt: Date; expiresAt: Date }

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function host(value: string | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}
function knownRegion(value: string | undefined | null): DataRegion | null {
  return value && value in DATA_REGIONS ? value as DataRegion : null;
}

/** Supabase pooler hosts carry their region: aws-0-ap-south-1.pooler.supabase.com. */
export function databaseRegion(databaseUrl: string | undefined): string | null {
  const name = host(databaseUrl);
  if (!name) return null;
  if (LOCAL_HOSTS.has(name)) return "local";
  const pooled = /^aws-\d+-([a-z]{2}-[a-z]+-\d)\.pooler\.supabase\.com$/.exec(name);
  return pooled ? pooled[1] : null;
}

function placed(service: DataService, provider: string, location: string | null, note: string, verifications: readonly ServiceVerification[], now: Date): ServicePlacement {
  if (!location) {
    return { service, provider, location: null, evidence: null, state: SERVICE_REGION_SUPPORT[service].length ? "not_configured" : "unsupported", note };
  }
  const proof = verifications.find(item => item.service === service && item.region === location && item.expiresAt > now);
  return {
    service, provider, location, note,
    state: proof ? "verified" : "configured",
    evidence: proof ? { verifiedAt: proof.verifiedAt.toISOString(), expiresAt: proof.expiresAt.toISOString() } : null,
  };
}

/**
 * Where each service actually processes this deployment's data, read from the
 * live configuration. A detected location is only "configured" until platform
 * evidence for that exact service and region is recorded and unexpired.
 */
export function buildProcessingInventory(env: Env, verifications: readonly ServiceVerification[] = [], now = new Date()): ServicePlacement[] {
  const db = databaseRegion(env.DATABASE_URL);
  const storageHost = host(env.S3_ENDPOINT);
  const files = storageHost
    ? (LOCAL_HOSTS.has(storageHost) ? "local" : storageHost.endsWith(".r2.cloudflarestorage.com") ? null : knownRegion(env.S3_REGION))
    : env.S3_BUCKET_NAME ? (env.S3_REGION || "us-east-1") : null;
  const aiOrder = (env.AI_PROVIDER?.trim() || env.AI_PROVIDER_ORDER || "openai").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  const ollamaLocal = aiOrder.length === 1 && aiOrder[0] === "ollama" && LOCAL_HOSTS.has(host(env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") || "");
  const documentMediaRemote = env.SCHOOL_AI_MEDIA_EGRESS_APPROVED === "true" && Boolean(env.OPENAI_API_KEY && env.SCHOOL_AI_DOCUMENT_MODEL);
  const voiceMediaRemote = env.SCHOOL_AI_MEDIA_EGRESS_APPROVED === "true" && Boolean(env.OPENAI_API_KEY && env.SCHOOL_AI_TRANSCRIPTION_MODEL);
  const mediaNote = documentMediaRemote || voiceMediaRemote
    ? `Raw media is sent to OpenAI for ${[documentMediaRemote ? "document" : "", voiceMediaRemote ? "voice" : ""].filter(Boolean).join(" and ")} processing; this is separate from text processing and is not local.`
    : null;
  const aiProvider = ollamaLocal && mediaNote ? "Ollama (loopback) + OpenAI media" : ollamaLocal ? "Ollama (loopback)" : aiOrder.join(", ") || "none";

  const inventory: Record<DataService, ServicePlacement> = {
    database: placed("database", "PostgreSQL", db, db ? "Read from the database connection host." : "The database host does not identify its region.", verifications, now),
    backups: placed("backups", "Database provider backups", db === "local" ? "local" : db, "Provider backups follow the database project region; backup expiry follows the provider retention window.", verifications, now),
    files: placed("files", storageHost?.endsWith(".r2.cloudflarestorage.com") ? "Cloudflare R2" : "S3-compatible storage", files,
      storageHost?.endsWith(".r2.cloudflarestorage.com") ? "R2 automatic placement does not pin a region." : files ? "Read from the storage endpoint and region." : "File storage is not configured.", verifications, now),
    ai: ollamaLocal && !mediaNote
      ? placed("ai", aiProvider, "local", "Text requests stay on this host.", verifications, now)
      : placed("ai", aiProvider, null, mediaNote ?? "Processing location is decided by the AI provider; only pseudonymized text is sent (SKO-383).", verifications, now),
    email: placed("email", env.SMTP_HOST ? "SMTP relay" : "Not configured", null, env.SMTP_HOST ? "The mail provider decides processing location." : "Outbound email is not configured.", verifications, now),
    whatsapp: placed("whatsapp", env.WHATSAPP_ACCESS_TOKEN ? "WhatsApp Cloud API" : "Not configured", null, "Meta decides processing location.", verifications, now),
    sms: placed("sms", env.TWILIO_ACCOUNT_SID ? "Twilio" : "Not configured", null, "The SMS provider decides processing location.", verifications, now),
    support: placed("support", "Vendor support", null, "Vendor access only through school-approved, time-bounded support grants.", verifications, now),
  };
  return DATA_SERVICES.map(service => inventory[service]);
}

export interface PlacementPlanItem { service: DataService; from: string | null; to: string | null; outcome: "stays" | "moves" | "outside_region" | "unsupported" }
export interface PlacementPlan { targetRegion: DataRegion; items: PlacementPlanItem[]; blockers: string[]; blocked: boolean }

/** Lists every service a move to `targetRegion` touches and blocks combinations the platform cannot deliver. */
export function planPlacement(inventory: readonly ServicePlacement[], targetRegion: DataRegion): PlacementPlan {
  const items: PlacementPlanItem[] = inventory.map(entry => {
    const supported = SERVICE_REGION_SUPPORT[entry.service].includes(targetRegion);
    if (!SERVICE_REGION_SUPPORT[entry.service].length) return { service: entry.service, from: entry.location, to: entry.location, outcome: "outside_region" };
    if (!supported) return { service: entry.service, from: entry.location, to: null, outcome: "unsupported" };
    return { service: entry.service, from: entry.location, to: targetRegion, outcome: entry.location === targetRegion ? "stays" : "moves" };
  });
  const blockers = items.filter(item => item.outcome === "unsupported" && REQUIRED_SERVICES.includes(item.service))
    .map(item => `${item.service} cannot be placed in ${DATA_REGIONS[targetRegion]}.`);
  return { targetRegion, items, blockers, blocked: blockers.length > 0 };
}
