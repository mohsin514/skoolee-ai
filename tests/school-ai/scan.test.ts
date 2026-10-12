import assert from "node:assert/strict";
import { test } from "node:test";
import { cropRectangle, scanImageDimensions } from "../../src/lib/school-ai/scan";
import { assembleScanPdf } from "../../src/lib/school-ai/scan-pdf";
import { scanCopy } from "../../src/components/school-ai/scan-copy";
import sharp from "sharp";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=", "base64");
test("scan checks dimensions before decoding and refuses oversized or unsupported image headers", () => {
  assert.deepEqual(scanImageDimensions(png, "image/png"), { width: 1, height: 1 });
  const forged = Buffer.from(png); forged.writeUInt32BE(100000, 16);
  assert.throws(() => scanImageDimensions(forged, "image/png"), /SCAN_DIMENSIONS/);
  for (const bytes of [Buffer.from("<svg onload='bad'>"), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 0]), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 10])]) assert.throws(() => scanImageDimensions(bytes, "image/jpeg"));
  assert.throws(() => scanImageDimensions(png, "image/webp"));
});
test("crop preserves the requested rectangle and bounds all image work", () => {
  assert.deepEqual(cropRectangle(1200, 1600, { top: 10, right: 20, bottom: 5, left: 10 }), { x: 120, y: 160, width: 840, height: 1360 });
  assert.throws(() => cropRectangle(12000, 16000, { top: 0, right: 0, bottom: 0, left: 0 }));
  for (const top of [-1, 41, NaN]) assert.throws(() => cropRectangle(100, 100, { top, right: 0, bottom: 0, left: 0 }));
});
test("prepared PDF contains the actual selected number of pages and rejects invalid albums", async () => {
  const clean = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer();
  const result = await assembleScanPdf([{ bytes: clean, mimeType: "image/png" }, { bytes: clean, mimeType: "image/png" }]);
  assert.equal(result.subarray(0, 5).toString(), "%PDF-");
  assert.equal((result.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 2);
  assert.equal(result.includes(Buffer.from("https://")), false);
  await assert.rejects(() => assembleScanPdf([]), /SCAN_LIMIT/);
  await assert.rejects(() => assembleScanPdf(Array.from({ length: 11 }, () => ({ bytes: png, mimeType: "image/png" }))), /SCAN_LIMIT/);
});
test("malformed pages with valid dimension headers cannot silently create blank PDF pages", async () => {
  await assert.rejects(() => assembleScanPdf([{ bytes: png.subarray(0, 33), mimeType: "image/png" }]));
  const headerOnlyJpeg = Buffer.from([0xff,0xd8,0xff,0xc0,0,8,8,0,1,0,1,1,0xff,0xd9]);
  assert.deepEqual(scanImageDimensions(headerOnlyJpeg, "image/jpeg"), { width: 1, height: 1 });
  await assert.rejects(() => assembleScanPdf([{ bytes: headerOnlyJpeg, mimeType: "image/jpeg" }]));
});
test("all scan controls and recovery messages have English, Arabic and Urdu copy", () => {
  for (const locale of ["ar", "ur"] as const) for (const key of Object.keys(scanCopy("en")) as Array<keyof ReturnType<typeof scanCopy>>) assert(scanCopy(locale)[key].trim(), `${locale}:${key}`);
});
