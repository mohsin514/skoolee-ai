/**
 * The local QA environment contract (SKAI-1268): which ports the isolated
 * PostgreSQL cluster, the app under test and the in-process fake providers
 * use. Each value comes from an explicit environment variable, with the
 * historical port as the default, so suites can run side by side on free
 * ports. See docs/qa/QA-ENVIRONMENT.md.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";

const port = (key: string, fallback: number): number => {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${key} must be a port number (1024-65535), got "${raw}".`);
  return value;
};

/** Isolated PostgreSQL cluster (scripts/qa/isolated-env.sh). */
export const qaDbPort = () => port("QA_DB_PORT", 55438);
/** Origin of the app under test; a suite's own *_TEST_APP variable still wins. */
export const qaAppUrl = (suiteOverride?: string) => (suiteOverride || process.env.QA_APP_URL || `http://localhost:${port("QA_APP_PORT", 3107)}`).replace(/\/+$/, "");
/** Fake S3 store started inside a suite; the app must run with S3_ENDPOINT pointing here. */
export const qaFakeS3Port = () => port("QA_FAKE_S3_PORT", 55441);

/** Who is listening on a port, for the diagnostic. Best effort: lsof may be missing. */
function owner(p: number): string {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" }).trim().split("\n").slice(1).map(line => line.split(/\s+/).slice(0, 2).join(" pid ")).join(", ") || "unknown process";
  } catch {
    return "unknown process";
  }
}

/** Fails before a suite runs when a port it means to bind is already taken. */
export async function assertPortFree(p: number, purpose: string, envKey: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "EADDRINUSE"
        ? new Error(`Port ${p} (${purpose}) is already in use by ${owner(p)}. Stop it or pick a free port with ${envKey}=<port>.`)
        : error);
    });
    probe.listen(p, "127.0.0.1", () => probe.close(() => resolve()));
  });
}
