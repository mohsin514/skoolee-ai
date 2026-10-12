export const MAX_SCAN_PAGES = 10;
export const MAX_SCAN_BYTES = 8 * 1024 * 1024;
export const MAX_SCAN_PIXELS = 12_000_000;
export type ScanCrop = { top: number; right: number; bottom: number; left: number };
export const EMPTY_SCAN_CROP: ScanCrop = { top: 0, right: 0, bottom: 0, left: 0 };

export function cropRectangle(width: number, height: number, crop: ScanCrop) {
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0) || width * height > MAX_SCAN_PIXELS) throw new Error("SCAN_DIMENSIONS");
  if (!Object.values(crop).every(value => Number.isFinite(value) && value >= 0 && value <= 40)) throw new Error("SCAN_CROP");
  const x = Math.floor(width * crop.left / 100), y = Math.floor(height * crop.top / 100);
  const w = width - x - Math.floor(width * crop.right / 100), h = height - y - Math.floor(height * crop.bottom / 100);
  return { x, y, width: w, height: h };
}

/** Read dimensions before passing an untrusted image to the PDF renderer. */
export function scanImageDimensions(bytes: Uint8Array, mimeType: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (mimeType === "image/png" && bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) {
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") throw new Error("SCAN_IMAGE_INVALID");
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mimeType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error("SCAN_IMAGE_INVALID");
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error("SCAN_IMAGE_INVALID");
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) { height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break; }
      offset += length;
    }
  }
  if (!width || !height || width > 6000 || height > 6000 || width * height > MAX_SCAN_PIXELS) throw new Error("SCAN_DIMENSIONS");
  return { width, height };
}
