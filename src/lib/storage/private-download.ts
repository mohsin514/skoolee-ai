import { readPrivateObject } from "./s3";

const INLINE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export type PrivateObjectReader = (key: string) => Promise<ReadableStream<Uint8Array>>;

/** Authorization and an exact scoped storage-key check belong to the calling domain. */
export async function privateDownloadResponse(
  storageKey: string,
  fileName: string,
  options: { contentType?: string; inlineImage?: boolean } = {},
  read: PrivateObjectReader = readPrivateObject,
): Promise<Response> {
  let stream: ReadableStream<Uint8Array>;
  try { stream = await read(storageKey); }
  catch { return Response.json({ error: "This file is unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
  const name = fileName.replace(/[\r\n\x00-\x1f\x7f/\\]/g, "_").slice(0, 200) || "download";
  const fallback = name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/"/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const inline = options.inlineImage === true && INLINE_IMAGES.has(options.contentType ?? "");
  return new Response(stream, { headers: {
    "Content-Type": inline ? options.contentType! : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
  } });
}
