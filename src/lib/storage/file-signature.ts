/** Magic-byte checks shared by private uploads and AI intake. A MIME label alone is never trusted. */
const startsWith = (bytes: Uint8Array, sig: number[], at = 0) => bytes.length >= at + sig.length && sig.every((n, i) => bytes[at + i] === n);
const ascii = (bytes: Uint8Array, from: number, to: number) => new TextDecoder("latin1").decode(bytes.slice(from, to));
const ZIP = [0x50, 0x4b, 0x03, 0x04], OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** OOXML is a ZIP; additionally require its package parts ([Content_Types].xml and the main part folder) in the first 64 KB. */
function isOoxml(bytes: Uint8Array, folder: "word/" | "xl/") {
  if (!startsWith(bytes, ZIP)) return false;
  const head = ascii(bytes, 0, 65536);
  return head.includes("[Content_Types].xml") && head.includes(folder);
}

function isUtf8Text(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return true; } catch { return false; }
}

/**
 * True when the bytes carry the signature for the MIME type. Text: `strictText` additionally requires valid UTF-8
 * (private uploads); otherwise only NUL bytes are refused (intake's historic rule, which accepts CSV in other encodings).
 */
export function matchesFileSignature(mimeType: string, bytes: Uint8Array, options: { strictText?: boolean } = {}): boolean {
  if (!bytes.length) return false;
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  switch (mime) {
    case "application/pdf": return ascii(bytes, 0, 5) === "%PDF-";
    case "image/jpeg": return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png": return startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/webp": return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
    case "image/gif": return ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6));
    case "application/msword": case "application/vnd.ms-excel": return startsWith(bytes, OLE);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return isOoxml(bytes, "word/");
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return isOoxml(bytes, "xl/");
    case "text/plain": case "text/csv": return options.strictText ? isUtf8Text(bytes) : !bytes.includes(0);
    default: return false;
  }
}
