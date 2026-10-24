import assert from "node:assert/strict";
import test from "node:test";
import { storageConnectOrigins } from "../../src/lib/storage/csp";
import config from "../../next.config";

test("the app connect policy permits its configured S3 upload origin", async () => {
  const headers = await config.headers!();
  const policy = headers.find(row => row.source === "/:path*")!.headers.find(header => header.key === "Content-Security-Policy")!.value;
  const connections = policy.split("; ").find(directive => directive.startsWith("connect-src "))!;
  for (const origin of storageConnectOrigins(process.env)) assert.ok(connections.split(" ").includes(origin));
  assert.ok(connections.includes("'self'"));
  assert.ok(!connections.includes("https://*.amazonaws.com"));
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
