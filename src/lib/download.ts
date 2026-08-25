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
  const blob = await res.blob();
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
