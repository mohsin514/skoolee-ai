// SKAI-1848: browser helpers shared by the SmartUpload component and the phone /drop page.

export const DROPPABLE = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "text/csv"] as const;
export type DropType = (typeof DROPPABLE)[number];
const EXTENSIONS: Record<string, DropType> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".docx": DROPPABLE[4], ".xlsx": DROPPABLE[5], ".txt": "text/plain", ".csv": "text/csv" };

/** The phone may send only what this input accepts, narrowed to what staging can hold. */
export function dropTypesFor(accept: string): DropType[] {
  const tokens = accept.split(",").map(token => token.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return [...DROPPABLE];
  return DROPPABLE.filter(type => tokens.some(token => token === type || token === `${type.split("/")[0]}/*` || EXTENSIONS[token] === type));
}

/** Same rule the browser applies to the file picker, for files dropped, pasted or sent from the phone. */
export function fileMatchesAccept(file: { name: string; type: string }, accept: string): boolean {
  const tokens = accept.split(",").map(token => token.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return true;
  const type = file.type.toLowerCase(), name = file.name.toLowerCase();
  return tokens.some(token => token.startsWith(".") ? name.endsWith(token) : token.endsWith("/*") ? type.startsWith(token.slice(0, -1)) : type === token);
}

/** SKAI-1980: the computer polls fast while pages arrive, then backs off to at most 5 s (and after a failed poll). */
export const DROP_POLL_MIN_MS = 1500, DROP_POLL_MAX_MS = 5000;
export function nextDropPollDelay(previous: number, gotNewItem: boolean): number {
  return gotNewItem ? DROP_POLL_MIN_MS : Math.min(Math.max(previous, DROP_POLL_MIN_MS) * 2, DROP_POLL_MAX_MS);
}

/**
 * Scanner "document" look: greyscale with the darkest and lightest 2% stretched to black and white, so pencil
 * marks and faint photocopies read clearly. Returns a JPEG no larger than 2400px on its long side.
 */
export async function scanToJpeg(source: CanvasImageSource, width: number, height: number, enhance: boolean): Promise<Blob> {
  const scale = Math.min(1, 2400 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: enhance })!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (enhance) {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height), data = image.data, histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) { const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000 | 0; data[i] = g; histogram[g]++; }
    const pixels = data.length / 4, cut = pixels * 0.02;
    let low = 0, high = 255, seen = 0;
    while (low < 254 && (seen += histogram[low]) < cut) low++;
    seen = 0; while (high > low + 1 && (seen += histogram[high]) < cut) high--;
    const range = Math.max(1, high - low);
    for (let i = 0; i < data.length; i += 4) { const v = Math.max(0, Math.min(255, (data[i] - low) * 255 / range)); data[i] = data[i + 1] = data[i + 2] = v; }
    ctx.putImageData(image, 0, 0);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("SCAN_ENCODE")), "image/jpeg", 0.86));
}
