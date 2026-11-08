import { createHash } from "node:crypto";
import { PROTECTED_KEY_FIELDS } from "./release";

// SKO-408 R19.2–R19.4, R19.11: the evidence pack and its Integrity_Manifest. Pure: every file is
// canonical UTF-8 JSON, every digest is SHA-256 over exactly those bytes, and the ZIP stores them
// uncompressed, so `unzip` and `shasum -a 256` can check a pack with none of this code.

export const EVIDENCE_PACK_FORMAT = "skoolee-evidence-pack/1";
export const DIGEST_ALGORITHM = "SHA-256";

export type EvidenceRecordRef = { type: string; id: string; version: number | null };
export type EvidenceGap = { type: string; id: string; version: number | null; reason: string };
export type EvidenceFile = { path: string; content: string };

export interface IntegrityManifest {
  format: typeof EVIDENCE_PACK_FORMAT;
  algorithm: typeof DIGEST_ALGORITHM;
  generatedAt: string;
  scope: { kind: "ASSESSMENT" | "ATTEMPT"; id: string; schoolId: string; campusId: string };
  includedKeys: boolean;
  includedCapture: boolean;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  records: EvidenceRecordRef[];
  gaps: EvidenceGap[];
}

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit, no insignificant whitespace, dates as
 * ISO strings. Two producers that agree on the data agree on the bytes.
 */
export function canonicalJson(value: unknown): string {
  const normalise = (input: unknown): unknown => {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(normalise);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.keys(input as Record<string, unknown>).sort().filter(key => (input as Record<string, unknown>)[key] !== undefined).map(key => [key, normalise((input as Record<string, unknown>)[key])]));
    }
    return input;
  };
  return JSON.stringify(normalise(value));
}

export const sha256Hex = (content: string | Uint8Array) => createHash("sha256").update(content).digest("hex");

const PROTECTED = new Set<string>(PROTECTED_KEY_FIELDS);

/** R19.5: removes every Protected_Key field at any depth and says how many were removed. */
export function redactProtectedKeys<T>(value: T): { value: T; removed: number } {
  let removed = 0;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object" && !(input instanceof Date)) {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(input as Record<string, unknown>)) {
        if (PROTECTED.has(key)) { removed++; continue; }
        out[key] = walk(inner);
      }
      return out;
    }
    return input;
  };
  return { value: walk(value) as T, removed };
}

/** R19.2, R19.4, R19.11: the manifest is computed from the exact bytes that will be shipped. */
export function buildManifest(input: Omit<IntegrityManifest, "format" | "algorithm" | "files"> & { files: EvidenceFile[] }): IntegrityManifest {
  const paths = new Set<string>();
  for (const file of input.files) {
    if (!/^[a-z0-9][a-z0-9/_.-]*\.json$/.test(file.path) || file.path.includes("..")) throw new Error(`Unsafe evidence file path: ${file.path}`);
    if (paths.has(file.path)) throw new Error(`Duplicate evidence file path: ${file.path}`);
    paths.add(file.path);
  }
  return {
    format: EVIDENCE_PACK_FORMAT,
    algorithm: DIGEST_ALGORITHM,
    generatedAt: input.generatedAt,
    scope: input.scope,
    includedKeys: input.includedKeys,
    includedCapture: input.includedCapture,
    files: [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map(file => ({ path: file.path, sha256: sha256Hex(Buffer.from(file.content, "utf8")), bytes: Buffer.byteLength(file.content, "utf8") })),
    records: [...input.records].sort((a, b) => `${a.type}/${a.id}/${a.version}`.localeCompare(`${b.type}/${b.id}/${b.version}`)),
    gaps: input.gaps,
  };
}

/** Our own check, used before a pack is stored or served; the independent check lives in the tests. */
export function verifyManifest(manifest: IntegrityManifest, files: EvidenceFile[]): string[] {
  const problems: string[] = [];
  const byPath = new Map(files.map(file => [file.path, file.content]));
  for (const entry of manifest.files) {
    const content = byPath.get(entry.path);
    if (content === undefined) { problems.push(`missing file ${entry.path}`); continue; }
    if (sha256Hex(Buffer.from(content, "utf8")) !== entry.sha256) problems.push(`digest mismatch ${entry.path}`);
  }
  for (const path of byPath.keys()) if (!manifest.files.some(entry => entry.path === path)) problems.push(`unlisted file ${path}`);
  return problems;
}

// ── Stored (uncompressed) ZIP ────────────────────────────────────────────────────────────────
// Method 0 keeps the archived bytes identical to the digested bytes, so a verifier can hash the
// extracted files directly. CRC-32 is the ZIP container's own check, not the evidence digest.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A ZIP of `files` stored without compression, entries in path order, fixed DOS timestamp. */
export function zipStored(files: EvidenceFile[], when: Date): Buffer {
  const dosTime = ((when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | Math.floor(when.getUTCSeconds() / 2)) & 0xffff;
  const dosDate = (((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate()) & 0xffff;
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const name = Buffer.from(file.path, "utf8"), data = Buffer.from(file.content, "utf8"), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** The pack as shipped: every evidence file plus `manifest.json`, which the manifest does not list. */
export function packArchive(manifest: IntegrityManifest, files: EvidenceFile[]): Buffer {
  return zipStored([...files, { path: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` }], new Date(manifest.generatedAt));
}
