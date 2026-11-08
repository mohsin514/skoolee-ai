import { Document, Image as PdfImage, Page, renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { MAX_DOCUMENT_BYTES } from "./intake";
import { MAX_SCAN_BYTES, MAX_SCAN_PAGES, MAX_SCAN_PIXELS, scanImageDimensions } from "./scan";

/** Embedded byte buffers only: no URLs, fonts, HTML or external renderer fetches. */
export async function assembleScanPdf(images: Array<{ bytes: Buffer; mimeType: string }>) {
  if (!images.length || images.length > MAX_SCAN_PAGES || images.reduce((sum, image) => sum + image.bytes.length, 0) > MAX_SCAN_BYTES) throw new Error("SCAN_LIMIT");
  const pages = [];
  // The PDF renderer can silently omit corrupt images. Decode sequentially with
  // a pixel cap, reject warnings/truncation, then embed clean JPEG bytes only.
  for (const image of images) {
    scanImageDimensions(image.bytes, image.mimeType);
    const decoded = await sharp(image.bytes, { limitInputPixels: MAX_SCAN_PIXELS, failOn: "warning", animated: false })
      .rotate().flatten({ background: "white" }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
    pages.push({ bytes: decoded.data, width: decoded.info.width, height: decoded.info.height });
  }
  const result = await renderToBuffer(<Document title="Prepared document scan" creationDate={new Date(0)} modificationDate={new Date(0)}>
    {pages.map((page, index) => {
      const size: [number, number] = page.width > page.height ? [841.89, 595.28] : [595.28, 841.89];
      const scale = Math.min((size[0] - 36) / page.width, (size[1] - 36) / page.height);
      return <Page key={index} size={size} wrap={false} style={{ padding: 18, alignItems: "center", justifyContent: "center" }}><PdfImage src={page.bytes} style={{ width: page.width * scale, height: page.height * scale }} /></Page>;
    })}
  </Document>);
  if (result.length > MAX_DOCUMENT_BYTES) throw new Error("SCAN_LIMIT");
  return result;
}
