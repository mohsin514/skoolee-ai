import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
export const documentKinds = ["syllabus", "paper", "answer_script", "register", "fee_sheet", "timetable", "staff_list", "policy", "other"] as const;
export const documentKindSchema = z.enum(documentKinds);
export const languageSchema = z.enum(["en", "ar", "ur"]);

const mimeExtensions: Record<string, string[]> = {
  "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
  "image/webp": ["webp"], "text/plain": ["txt"], "text/csv": ["csv"],
};

/** Both MIME and signature matter. HTML/SVG/Office macros never become trusted previews. */
export function validateDocument(fileName: string, mimeType: string, bytes: Uint8Array): string {
  const mime = mimeType.split(";")[0].toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!mimeExtensions[mime]?.includes(ext)) throw new Error("Use a PDF, JPEG, PNG, WebP, text or CSV file.");
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Documents must be between 1 byte and 10 MB.");
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 16));
  const valid = mime === "application/pdf" ? head.startsWith("%PDF-")
    : mime === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === "image/png" ? [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)
    : mime === "image/webp" ? head.startsWith("RIFF") && head.slice(8, 12) === "WEBP"
    : !bytes.includes(0);
  if (!valid) throw new Error("The file content does not match its format.");
  return mime;
}

export function validateAudio(mimeType: string, bytes: Uint8Array): string {
  const mime = mimeType.split(";")[0].toLowerCase();
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error("Recording must be between 1 byte and 12 MB.");
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 16));
  const valid = ["audio/webm", "video/webm"].includes(mime) ? [0x1a,0x45,0xdf,0xa3].every((n,i) => bytes[i] === n)
    : ["audio/mp4", "video/mp4", "audio/x-m4a"].includes(mime) ? head.slice(4,8) === "ftyp"
    : ["audio/wav", "audio/x-wav"].includes(mime) ? head.startsWith("RIFF") && head.slice(8,12) === "WAVE"
    : mime === "audio/mpeg" ? head.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    : false;
  if (!valid) throw new Error("Use a supported WebM, MP4, MP3 or WAV recording.");
  return mime;
}

export const extractionSchema = z.object({
  text: z.string().max(80000),
  pages: z.array(z.object({ page: z.number().int().min(1).max(10000), text: z.string().max(20000) }).strict()).max(200),
  uncertainties: z.array(z.string().max(1000)).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.pages.map(page => page.page)).size !== value.pages.length) context.addIssue({ code: "custom", message: "Duplicate source page numbers." });
});

export function parseModelJson(text: string): unknown {
  if (text.length > 250000) throw new Error("The generated response exceeds the review limit.");
  const value = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(value);
}

export function safeOriginalFileName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180) || "document";
}
