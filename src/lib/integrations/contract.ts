// SKO-445: the public v1 contract — a small, separately supported surface, not the internal API.
// Field types are frozen per version; checkCompatibility() is what the contract test runs before a release, so a
// removed field, a changed type or a newly required request field is caught as breaking.

export type FieldType = "string" | "string?" | "integer" | "boolean" | "datetime" | "datetime?";
export type Shape = Record<string, FieldType>;
export type Contract = {
  version: string;
  status: "CURRENT" | "DEPRECATED";
  sunsetAt: string | null;
  resources: Record<string, Shape>;
  requests: Record<string, Shape>;
  topics: Record<string, Shape>;
  errors: string[];
  pagination: { style: "cursor"; maxLimit: number; defaultLimit: number };
  idempotency: string;
  ordering: string;
  deprecation: string;
};

export const V1: Contract = {
  version: "v1",
  status: "CURRENT",
  sunsetAt: null,
  resources: {
    student: { id: "string", admissionNo: "string?", fullName: "string", campusId: "string", classId: "string", className: "string", status: "string", enrolledAt: "datetime" },
    externalRef: { studentId: "string", system: "string", externalId: "string", updatedAt: "datetime" },
  },
  requests: { linkExternalId: { studentId: "string", system: "string", externalId: "string" } },
  topics: { "student.updated": { studentId: "string", campusId: "string", changed: "string" }, "connection.test": { connectionId: "string", note: "string" } },
  errors: ["UNAUTHENTICATED", "FORBIDDEN_SCOPE", "NOT_FOUND", "VALIDATION_FAILED", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "QUOTA_EXCEEDED", "CONNECTION_PAUSED", "UNSUPPORTED_VERSION"],
  pagination: { style: "cursor", maxLimit: 200, defaultLimit: 50 },
  idempotency: "POST requests require an Idempotency-Key header. Replaying the same key with the same body returns the original response; a different body returns 409 IDEMPOTENCY_CONFLICT.",
  ordering: "Webhook events carry a stable id and occurredAt. Delivery is at-least-once and may arrive out of order or more than once (retries and replays reuse the id); consumers deduplicate on id and order by occurredAt.",
  deprecation: "A version is supported for at least 12 months after its successor is published. Deprecated versions return a Sunset header with the date; breaking changes only ship in a new version.",
};

export const CONTRACTS: Record<string, Contract> = { v1: V1 };

/** Breaking: a removed resource/field/topic, a changed type, a request field that became required or new. */
export function checkCompatibility(previous: Contract, next: Contract) {
  const breaking: string[] = [];
  const shapes = (kind: "resources" | "topics", strictAdd: boolean) => {
    for (const [name, shape] of Object.entries(previous[kind])) {
      const now = next[kind][name];
      if (!now) { breaking.push(`${kind}.${name} was removed`); continue; }
      for (const [field, type] of Object.entries(shape)) {
        if (!(field in now)) breaking.push(`${kind}.${name}.${field} was removed`);
        else if (now[field] !== type) breaking.push(`${kind}.${name}.${field} changed from ${type} to ${now[field]}`);
      }
      if (strictAdd) for (const field of Object.keys(now)) if (!(field in shape) && !now[field].endsWith("?")) breaking.push(`${kind}.${name}.${field} is a new required field`);
    }
  };
  shapes("resources", false); shapes("topics", false);
  for (const [name, shape] of Object.entries(previous.requests)) {
    const now = next.requests[name];
    if (!now) { breaking.push(`requests.${name} was removed`); continue; }
    for (const [field, type] of Object.entries(now)) {
      if (!(field in shape) && !type.endsWith("?")) breaking.push(`requests.${name}.${field} is a new required field`);
      else if (field in shape && shape[field] !== type) breaking.push(`requests.${name}.${field} changed from ${shape[field]} to ${type}`);
    }
  }
  for (const code of previous.errors) if (!next.errors.includes(code)) breaking.push(`error ${code} was removed`);
  return { compatible: breaking.length === 0, breaking };
}

/** Values the serializer produced must match the frozen shape exactly. */
export function conforms(shape: Shape, value: Record<string, unknown>) {
  const problems: string[] = [];
  for (const [field, type] of Object.entries(shape)) {
    const v = value[field], optional = type.endsWith("?"), base = type.replace("?", "");
    if (v === null || v === undefined) { if (!optional) problems.push(`${field} is missing`); continue; }
    if (base === "string" && typeof v !== "string") problems.push(`${field} is not a string`);
    if (base === "integer" && !Number.isInteger(v)) problems.push(`${field} is not an integer`);
    if (base === "boolean" && typeof v !== "boolean") problems.push(`${field} is not a boolean`);
    if (base === "datetime" && (typeof v !== "string" || Number.isNaN(Date.parse(v)))) problems.push(`${field} is not a datetime`);
  }
  for (const field of Object.keys(value)) if (!(field in shape)) problems.push(`${field} is not in the contract`);
  return problems;
}
