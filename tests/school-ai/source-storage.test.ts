import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readOriginal, removeOriginal, saveOriginal, sourceStorageAvailable } from "../../src/lib/school-ai/source-storage";

const keys = ["SCHOOL_AI_STORAGE_DIR", "S3_BUCKET_NAME", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
async function fixture(run: (directory: string) => Promise<void>) {
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const cwd = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), "school-ai-private-storage-"));
  try {
    for (const key of keys) delete process.env[key];
    await mkdir(join(directory, "public"));
    process.chdir(directory);
    await run(directory);
  } finally {
    process.chdir(cwd);
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    await rm(directory, { recursive: true, force: true });
  }
}

test("a new private volume stores, reads and removes exact original bytes with restrictive file permissions", () => fixture(async directory => {
  process.env.SCHOOL_AI_STORAGE_DIR = join(directory, "private", "originals");
  assert.equal(sourceStorageAvailable(), true);
  const bytes = Buffer.from("طالب علم · طالب · student\n");
  const key = await saveOriginal("school-1", bytes, "text/plain");
  assert.match(key, /^school-ai\/school-1\/[a-f0-9-]+$/);
  assert.deepEqual(await readOriginal(key), bytes);
  assert.equal((await stat(join(process.env.SCHOOL_AI_STORAGE_DIR, key))).mode & 0o777, 0o600);
  await removeOriginal(key);
  await assert.rejects(() => readOriginal(key), { code: "ENOENT" });
}));

test("public roots and symlinked existing ancestors are unavailable before any write", () => fixture(async directory => {
  await symlink(join(directory, "public"), join(directory, "looks-private"));
  for (const root of [join(directory, "public"), join(directory, "public", "new"), join(directory, "looks-private"), join(directory, "looks-private", "not-created", "documents")]) {
    process.env.SCHOOL_AI_STORAGE_DIR = root;
    assert.equal(sourceStorageAvailable(), false);
    await assert.rejects(() => saveOriginal("school-1", Buffer.from("secret"), "text/plain"), { status: 503 });
  }
  await assert.rejects(() => stat(join(directory, "public", "school-ai")), { code: "ENOENT" });
  await assert.rejects(() => stat(join(directory, "public", "not-created")), { code: "ENOENT" });
}));

test("a symlinked public directory is resolved before comparing a private volume", () => fixture(async directory => {
  await rm(join(directory, "public"), { recursive: true });
  await mkdir(join(directory, "served"));
  await symlink(join(directory, "served"), join(directory, "public"));
  process.env.SCHOOL_AI_STORAGE_DIR = join(directory, "served", "documents");
  assert.equal(sourceStorageAvailable(), false);
  await assert.rejects(() => saveOriginal("school-1", Buffer.from("secret"), "text/plain"), { status: 503 });
}));

test("nested directory and object symlinks cannot expose, overwrite or remove public originals", () => fixture(async directory => {
  const root = join(directory, "private");
  process.env.SCHOOL_AI_STORAGE_DIR = root;
  await mkdir(join(root, "school-ai"), { recursive: true });
  await symlink(join(directory, "public"), join(root, "school-ai", "school-1"));
  const key = "school-ai/school-1/abcdef";
  await writeFile(join(directory, "public", "abcdef"), "preserve-public-file");
  await assert.rejects(() => saveOriginal("school-1", Buffer.from("secret"), "text/plain"), { status: 503 });
  await assert.rejects(() => readOriginal(key), { status: 503 });
  await assert.rejects(() => removeOriginal(key), { status: 503 });
  await rm(join(root, "school-ai", "school-1"));
  await mkdir(join(root, "school-ai", "school-1"));
  await symlink(join(directory, "public", "abcdef"), join(root, key));
  await assert.rejects(() => readOriginal(key), { status: 503 });
  await assert.rejects(() => removeOriginal(key), { status: 503 });
  assert.equal(await readFile(join(directory, "public", "abcdef"), "utf8"), "preserve-public-file");
}));

test("nested symlinks cannot substitute another school's private directory", () => fixture(async directory => {
  const root = join(directory, "private");
  process.env.SCHOOL_AI_STORAGE_DIR = root;
  const key = await saveOriginal("school-2", Buffer.from("other school"), "text/plain");
  await symlink(join(root, "school-ai", "school-2"), join(root, "school-ai", "school-1"));
  const forgedPath = key.replace("school-2", "school-1");
  await assert.rejects(() => readOriginal(forgedPath), { status: 503 });
  await assert.rejects(() => removeOriginal(forgedPath), { status: 503 });
  assert.equal((await readOriginal(key)).toString(), "other school");
}));

test("availability rejects invalid or unwritable disk configuration without silently using S3", () => fixture(async directory => {
  Object.assign(process.env, { S3_BUCKET_NAME: "synthetic", S3_ACCESS_KEY_ID: "synthetic", S3_SECRET_ACCESS_KEY: "synthetic" });
  assert.equal(sourceStorageAvailable(), true);
  await writeFile(join(directory, "file"), "not a directory");
  await symlink(join(directory, "missing-target"), join(directory, "dangling"));
  const blocked = join(directory, "blocked");
  await mkdir(blocked);
  await chmod(blocked, 0o500);
  try {
    for (const root of ["relative/documents", join(directory, "file"), join(directory, "file", "child"), join(directory, "dangling"), blocked]) {
      process.env.SCHOOL_AI_STORAGE_DIR = root;
      if (root === blocked && process.getuid?.() === 0) continue;
      assert.equal(sourceStorageAvailable(), false, root);
      await assert.rejects(() => saveOriginal("school-1", Buffer.from("secret"), "text/plain"), { status: 503 });
    }
  } finally { await chmod(blocked, 0o700); }
  delete process.env.SCHOOL_AI_STORAGE_DIR;
  delete process.env.S3_SECRET_ACCESS_KEY;
  assert.equal(sourceStorageAvailable(), false);
}));

test("object keys reject traversal before touching local storage", () => fixture(async directory => {
  process.env.SCHOOL_AI_STORAGE_DIR = join(directory, "private");
  for (const key of ["../public/secret", "school-ai/../abcdef", "school-ai/school-1/../../secret", "/school-ai/school-1/abcdef", "school-ai/school-1/abcdef/child"]) {
    await assert.rejects(() => readOriginal(key), { status: 400 });
    await assert.rejects(() => removeOriginal(key), { status: 400 });
  }
}));
