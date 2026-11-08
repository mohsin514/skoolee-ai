import assert from "node:assert/strict";
import test from "node:test";
import { storageConnectOrigins } from "../../src/lib/storage/csp";
import config from "../../next.config";

// tsx's ESM/CJS interop can expose the config one level deeper in the test
// runner while Next loads it directly. Normalize both shapes before inspection.
const nextConfig = (config as typeof config & { default?: typeof config }).default ?? config;

test("page CSP is nonce-backed in middleware; storage origins remain validated", async () => {
  const headers = await nextConfig.headers!();
  const pageHeaders = headers.find(row => row.source === "/:path*")!.headers;
  assert.equal(pageHeaders.find(header => header.key === "Content-Security-Policy"), undefined);
  assert.ok(storageConnectOrigins(process.env).every(origin => /^https?:\/\//.test(origin)));
});

test("storage upload origins match regional, dotted and custom endpoints", () => {
  assert.deepEqual(storageConnectOrigins({ S3_BUCKET_NAME: "school-files", S3_REGION: "ap-southeast-2" }), ["https://school-files.s3.ap-southeast-2.amazonaws.com"]);
  assert.deepEqual(storageConnectOrigins({ S3_BUCKET_NAME: "school.files" }), ["https://s3.us-east-1.amazonaws.com"]);
  assert.deepEqual(storageConnectOrigins({ S3_ENDPOINT: "https://account.r2.cloudflarestorage.com/path" }), ["https://account.r2.cloudflarestorage.com"]);
});

test("storage configuration cannot inject additional policy directives", () => {
  assert.throws(() => storageConnectOrigins({ S3_BUCKET_NAME: "bucket; connect-src *" }));
  assert.throws(() => storageConnectOrigins({ S3_ENDPOINT: "https://user:secret@example.com" }));
});
