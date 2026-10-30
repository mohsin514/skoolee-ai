/** RFC 4180-style CSV parser used by import previews in the browser and server. */
export function parseImportCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        value += char;
      }
      continue;
    }

    if (closedQuote && char !== "," && char !== "\r" && char !== "\n" && !/\s/.test(char)) {
      throw new Error("Unexpected text after a quoted CSV field");
    }
    if (char === '"' && value.length === 0 && !closedQuote) {
      quoted = true;
    } else if (char === ",") {
      row.push(value.trim());
      value = "";
      closedQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      closedQuote = false;
    } else if (!closedQuote) {
      value += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function normalizeImportHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function importField(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeImportHeader(alias)];
    if (value) return value;
  }
  return "";
}
