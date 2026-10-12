import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { accessSync, constants, lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/scope";

export function sourceStorageAvailable() {
  if (process.env.SCHOOL_AI_STORAGE_DIR) {
    try { return Boolean(diskRoot(true)); } catch { return false; }
  }
  return Boolean(process.env.S3_BUCKET_NAME && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

/** Resolve existing ancestors without requiring a new private directory to exist yet. */
function canonicalPath(path: string): string {
  try { return realpathSync(/* turbopackIgnore: true */ path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A dangling symlink is not a missing directory: do not follow it when a
    // later mkdir creates its target, which could be inside the public tree.
    try {
      if (lstatSync(/* turbopackIgnore: true */ path).isSymbolicLink()) throw new ApiError("The private document volume contains an unavailable symbolic link.", 503);
    } catch (statError) { if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError; }
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(/* turbopackIgnore: true */ canonicalPath(parent), basename(path));
  }
}

function within(path: string, directory: string) {
  return path === directory || path.startsWith(directory.endsWith(sep) ? directory : directory + sep);
}

function assertPrivate(path: string) {
  const publicPath = canonicalPath(join(/* turbopackIgnore: true */ process.cwd(), "public"));
  if (within(path, publicPath)) throw new ApiError("School documents cannot be stored in the public directory.", 503);
}

function diskRoot(writable = false) {
  const configured = process.env.SCHOOL_AI_STORAGE_DIR;
  if (!configured) return null;
  if (!isAbsolute(configured)) throw new ApiError("The private document volume must use an absolute path.", 503);
  try {
    // Runtime volumes and their ancestors must never become deployment inputs.
    const root = canonicalPath(normalize(configured));
    assertPrivate(root);
    let existing = root;
    for (;;) {
      try {
        if (!statSync(/* turbopackIgnore: true */ existing).isDirectory()) throw new ApiError("The private document volume must be a directory.", 503);
        accessSync(/* turbopackIgnore: true */ existing, constants.R_OK | constants.X_OK | (writable ? constants.W_OK : 0));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(existing) === existing) throw error;
        existing = dirname(existing);
      }
    }
    return root;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("The private document volume is unavailable.", 503);
  }
}

function diskObject(root: string, key: string) {
  const expected = join(/* turbopackIgnore: true */ root, key);
  let resolved: string;
  try { resolved = canonicalPath(expected); }
  catch { throw new ApiError("The private document location is unavailable.", 503); }
  assertPrivate(resolved);
  // Object paths may not redirect into another school's directory or escape
  // the configured volume, even when a nested directory is a symbolic link.
  if (resolved !== expected || !within(resolved, root)) throw new ApiError("The private document location is unavailable.", 503);
  return resolved;
}

function checkedKey(key: string) {
  if (!/^school-ai\/[a-zA-Z0-9_-]+\/[a-f0-9-]+$/.test(key)) throw new ApiError("Invalid source reference.", 400);
  return key;
}

function objectClient() {
  if (!process.env.S3_BUCKET_NAME || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) throw new ApiError("Private document storage is not configured.", 503);
  return new S3Client({ region: process.env.S3_REGION || "us-east-1", ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}), credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
}

export async function saveOriginal(schoolId: string, bytes: Buffer, mimeType: string) {
  const key = checkedKey(`school-ai/${schoolId}/${randomUUID()}`);
  const root = diskRoot(true);
  if (root) {
    const destination = diskObject(root, key);
    await mkdir(/* turbopackIgnore: true */ dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(/* turbopackIgnore: true */ diskObject(root, key), bytes, { flag: "wx", mode: 0o600 });
  } else {
    await objectClient().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: key, Body: bytes, ContentType: mimeType, CacheControl: "private, no-store" }));
  }
  return key;
}

export async function readOriginal(key: string) {
  checkedKey(key);
  const root = diskRoot();
  // Runtime private volumes are deliberately excluded from the deployment bundle.
  if (root) return readFile(/* turbopackIgnore: true */ diskObject(root, key));
  const result = await objectClient().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: key }));
  if (!result.Body) throw new ApiError("Original document is unavailable.", 404);
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function removeOriginal(key: string) {
  checkedKey(key);
  const root = diskRoot();
  if (root) await unlink(/* turbopackIgnore: true */ diskObject(root, key));
  else await objectClient().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: key }));
}
