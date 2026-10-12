import { cropRectangle, EMPTY_SCAN_CROP, MAX_SCAN_BYTES, type ScanCrop } from "@/lib/school-ai/scan";

/** Normalization/cropping happens locally; only an explicit save sends the result. */
export async function prepareScanImage(file: File, crop: ScanCrop = EMPTY_SCAN_CROP, rotate = false) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > MAX_SCAN_BYTES) throw new Error("SCAN_IMAGE_INVALID");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const rect = cropRectangle(bitmap.width, bitmap.height, crop);
    const scale = Math.min(1, 2400 / Math.max(rect.width, rect.height));
    const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = rotate ? height : width; canvas.height = rotate ? width : height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("SCAN_CANVAS_UNAVAILABLE");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    if (rotate) context.rotate(Math.PI / 2);
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, -width / 2, -height / 2, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("SCAN_IMAGE_INVALID")), "image/jpeg", 0.92));
    return { file: new File([blob], "scan-page.jpg", { type: "image/jpeg" }), width: canvas.width, height: canvas.height };
  } finally { bitmap.close(); }
}
