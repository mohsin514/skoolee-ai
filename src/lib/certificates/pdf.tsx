import path from "node:path";
import { Document, Font, Image, Page, Text, View, renderToBuffer, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { CertificateIssue } from "@prisma/client";
import { translateUi } from "@/lib/locale/ui-messages";
import type { Language } from "@/lib/locale/package";

// SKO-469: renders an issued document from its frozen content only, once; the bytes are then stored. Creation and modification dates are
// pinned to the issue time, so the same document always produces the same bytes. Identifiers (serial,
// hash, verification link) are always set left-to-right inside right-to-left documents.

Font.register({ family: "Certificate", fonts: [
  { src: path.join(process.cwd(), "public/fonts/NotoNaskhArabic-Regular.ttf"), fontWeight: 400 },
  { src: path.join(process.cwd(), "public/fonts/NotoNaskhArabic-Bold.ttf"), fontWeight: 700 },
] });

// react-pdf mangles mixed-script text under `direction: "rtl"`. Right-to-left lines are instead split into
// script runs laid out right to left; fontkit shapes each Arabic run itself, and Latin runs (names, roll
// numbers) keep their own order.
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN = /[A-Za-z0-9\u00C0-\u024F]/;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };
/** Splits a line into Arabic, Latin and neutral runs. Neutrals between two runs of one script join it; a
 *  neutral run at a boundary takes the right-to-left reading: reversed, brackets mirrored, spaces kept. */
export function scriptRuns(text: string) {
  const kind = (char: string) => (ARABIC.test(char) ? "A" : LATIN.test(char) ? "L" : "N");
  const tokens: { kind: string; text: string }[] = [];
  for (const char of text) {
    const k = kind(char), last = tokens[tokens.length - 1];
    if (last && last.kind === k) last.text += char; else tokens.push({ kind: k, text: char });
  }
  const merged: { kind: string; text: string }[] = [];
  tokens.forEach((token, index) => {
    const before = tokens[index - 1], after = tokens[index + 1];
    const kindNow = token.kind === "N" && before && after && before.kind === after.kind ? before.kind : token.kind;
    const last = merged[merged.length - 1];
    if (last && last.kind === kindNow) last.text += token.text; else merged.push({ kind: kindNow, text: token.text });
  });
  // A boundary neutral is drawn as its own left-to-right box, so it is laid out reversed and mirrored here.
  return merged.map(run => run.kind === "N" ? { ...run, text: [...run.text].reverse().map(char => MIRROR[char] ?? (char === " " ? "\u00A0" : char)).join("") } : run);
}
function Line({ text, rtl, style }: { text: string; rtl: boolean; style?: Style | Style[] }) {
  const base = [style].flat().filter(Boolean) as Style[];
  if (!rtl || !ARABIC.test(text) || !LATIN.test(text)) return <Text style={[...base, { textAlign: rtl ? "right" : "left" }]}>{text}</Text>;
  return <View style={{ flexDirection: "row-reverse", flexWrap: "wrap" }}>{scriptRuns(text).map((run, index) => <Text key={index} style={[...base, { flexShrink: run.kind === "L" ? 1 : 0 }]}>{run.text}</Text>)}</View>;
}

// An ID card is CR80 (85.6 × 54 mm), given as [width, height] in points and kept that way round.
const SIZES: Record<string, "A4" | "A5" | "LETTER" | [number, number]> = { A4: "A4", A5: "A5", LETTER: "LETTER", ID_CARD: [243, 153] };
const styles = StyleSheet.create({
  page: { fontFamily: "Certificate", color: "#172033" },
  school: { fontWeight: 700 },
  title: { fontWeight: 700, marginVertical: 10 },
  body: { lineHeight: 1.6 },
  meta: { color: "#667085" },
});

/** pdfkit tags each embedded font subset with six random capitals; same-length deterministic tags keep the
 *  byte offsets valid and make one document always render to the same bytes. */
function stableSubsetTags(pdf: Buffer) {
  const text = pdf.toString("latin1");
  const tags = [...new Set([...text.matchAll(/\/([A-Z]{6})\+/g)].map(match => match[1]))];
  const stable = text.replace(/\/([A-Z]{6})\+/g, (_, tag: string) => `/${String.fromCharCode(65 + tags.indexOf(tag)).padStart(6, "A")}+`);
  return Buffer.from(stable, "latin1");
}

export async function renderCertificate(issue: Pick<CertificateIssue, "serial" | "title" | "renderedBody" | "language" | "pageSize" | "photoUrl" | "issuedAt" | "artifactHash" | "verifyToken">, school: { schoolName: string; campusName: string }, origin: string) {
  const language = issue.language as Language;
  const t = (source: string) => translateUi(source, language);
  const rtl = language !== "en";
  const card = issue.pageSize === "ID_CARD";
  const issuedAt = issue.issuedAt ?? new Date(0);
  const scale = card ? 0.42 : 1;
  const align = { textAlign: rtl ? "right" : "left" } as const;
  const verifyUrl = `${origin}/api/public/certificates/verify?token=${issue.verifyToken}`;
  return stableSubsetTags(await renderToBuffer(<Document language={language} title={`${issue.title} ${issue.serial}`} creator="SkooleeAI" producer="SkooleeAI" creationDate={issuedAt} modificationDate={issuedAt}>
    <Page size={SIZES[issue.pageSize] ?? "A4"} orientation="portrait" style={[styles.page, { padding: card ? 10 : 48, fontSize: 12 * scale }]}>
      <View style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 10 * scale }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images have no alt attribute; the PDF carries the pupil name as text. */}
        {issue.photoUrl ? <Image src={issue.photoUrl} style={{ width: card ? 52 : 90, height: card ? 64 : 110, objectFit: "cover" }} /> : null}
        <View style={{ flex: 1 }}>
          <Line text={school.schoolName} rtl={rtl} style={[styles.school, { fontSize: 18 * scale }]} />
          {school.campusName && school.campusName !== school.schoolName ? <Line text={school.campusName} rtl={rtl} style={styles.meta} /> : null}
          <View style={{ marginVertical: card ? 3 : 10 }}><Line text={issue.title} rtl={rtl} style={[styles.title, { fontSize: 22 * scale, marginVertical: 0 }]} /></View>
          {issue.renderedBody.split("\n").map((line, index) => <Line key={index} text={line} rtl={rtl} style={[styles.body, { lineHeight: card ? 1.15 : 1.6 }]} />)}
        </View>
      </View>
      <View style={{ marginTop: card ? 4 : 36 }}>
        {!card ? <Line text={`${t("Authorized signatory")}: ____________________`} rtl={rtl} style={styles.meta} /> : null}
        <Text style={[styles.meta, align, { fontSize: 9 * Math.max(scale, 0.6), marginTop: card ? 2 : 12 }]}>{issue.serial} · {issuedAt.toISOString().slice(0, 10)}</Text>
        {!card ? <Text style={[styles.meta, align, { fontSize: 8 }]}>{t("Verify")}: {verifyUrl}</Text> : null}
        {!card ? <Text style={[styles.meta, align, { fontSize: 7 }]}>SHA-256 {issue.artifactHash}</Text> : null}
      </View>
    </Page>
  </Document>));
}
