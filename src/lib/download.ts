export async function downloadPdfFile(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let message = "Download failed";
    try {
      const json = await res.json();
      if (json?.error) message = json.error;
    } catch {}
    throw new Error(message);
  }
  // SKAI-1648: a 2xx HTML/JSON body (e.g. an expired-session page) is a failure, never a saved "PDF".
  const type = res.headers.get("content-type") ?? "";
  if (/json|html/i.test(type)) {
    let message = res.redirected || /html/i.test(type) ? "Your session may have expired. Sign in again and retry the download." : "Download failed";
    if (/json/i.test(type)) { try { const json = await res.json(); if (json?.error) message = json.error; } catch {} }
    throw new Error(message);
  }
  const blob = await res.blob();
  if (!(await isPdf(blob))) throw new Error("The downloaded file is not a valid PDF. Please try again.");
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadReportCardPdf(reportCardId: string, fallbackName: string) {
  const res = await fetch(`/api/reports/download?reportCardId=${encodeURIComponent(reportCardId)}`);
  const json = await res.json();
  if (!res.ok || !json?.success || !json.pdfUrl) {
    throw new Error(json?.error || "No report card PDF available");
  }
  await downloadPdfFile(json.pdfUrl, fallbackName);
}


/** A PDF starts with the "%PDF-" signature. */
export async function isPdf(blob: Blob) {
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}
