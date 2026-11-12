import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { latestRequest } from "../../src/lib/http/request-pool";

// SKAI-1859: the front-desk registers debounce their search, but a slow earlier list request could still land
// after a newer one and replace its rows ("ahmed" ending on the results for "ah"), and the old request kept running.
const REGISTERS = {
  "visitor-register.tsx": "/api/front-desk/visitors?${params()}",
  "postal-register.tsx": "/api/front-desk/postal?${params}",
  "phone-call-log.tsx": "/api/front-desk/phone-calls?${params}",
  "complaints-desk.tsx": "/api/front-desk/complaints?${params}",
  "certificates-desk.tsx": "/api/front-desk/certificates?${params}",
} as const;
const source = (file: string) => readFileSync(`src/components/operations/${file}`, "utf8");

for (const [file, url] of Object.entries(REGISTERS)) {
  test(`${file}: the list load aborts the older request and only the newest one writes rows, errors or loading`, () => {
    const ui = source(file);
    const body = ui.slice(ui.indexOf("const [listLoad] = useState(latestRequest);"), ui.indexOf("}, [listLoad,"));
    assert.ok(body.length > 0, "the list load is guarded by latestRequest");
    assert.match(body, /const request = listLoad\.start\(\);\n\s+setLoading\(true\);/);
    assert.ok(body.includes(`await fetch(\`${url}\`, { cache: "no-store", signal: request.signal });`), "the list fetch carries the abort signal");
    const guard = body.indexOf("if (!request.isCurrent()) return;");
    assert.ok(guard > 0 && guard < body.indexOf("if (!response.ok || !json.success)"), "a stale response returns before touching state");
    assert.match(body, /catch \(failure\) \{ if \(request\.isCurrent\(\)\) setLoadError\(/);
    assert.match(body, /finally \{ if \(request\.isCurrent\(\)\) setLoading\(false\); \}/);
    assert.ok(ui.includes("useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => { clearTimeout(timer); listLoad.cancel(); }; }, [load, q, listLoad]);"), "a new query or unmount cancels the in-flight list request, keeping the 250ms debounce");
  });
}

test("complaints: an older 'load more' page cannot be appended after a new search", () => {
  const ui = source("complaints-desk.tsx");
  const body = ui.slice(ui.indexOf("const loadMore = async () => {"), ui.indexOf("} catch { if (request.isCurrent()) setMore(\"failed\"); }"));
  assert.match(body, /const request = listLoad\.start\(\);/);
  assert.match(body, /signal: request\.signal \}\);/);
  assert.ok(body.indexOf("if (!request.isCurrent()) return;") < body.indexOf("setRows(current => [...current, ...json.data])"));
});

test("certificates: the pupil search aborts the older lookup when the query changes", () => {
  const ui = source("certificates-desk.tsx");
  const body = ui.slice(ui.indexOf("const controller = new AbortController();"), ui.indexOf("}, [query, reissue, searchNonce]);"));
  assert.match(body, /students=\$\{encodeURIComponent\(query\.trim\(\)\)\}`, \{ cache: "no-store", signal: controller\.signal \}\)/);
  assert.match(body, /if \(controller\.signal\.aborted\) return;/);
  assert.match(body, /return \(\) => \{ clearTimeout\(timer\); controller\.abort\(\); \};/);
});

test("a register search that resolves out of order keeps the newest rows and aborts the older request", async () => {
  // Mirrors the register load: start → fetch(signal) → isCurrent check → write.
  const guard = latestRequest();
  const signals: AbortSignal[] = [];
  let rows: string[] = [], loading = true;
  const load = async (q: string, delay: number) => {
    const request = guard.start();
    signals.push(request.signal);
    loading = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (!request.isCurrent()) return;
      rows = [`rows for ${q}`];
    } finally { if (request.isCurrent()) loading = false; }
  };
  await Promise.all([load("ah", 20), load("ahmed", 1)]);
  assert.deepEqual(rows, ["rows for ahmed"]);
  assert.equal(loading, false);
  assert.equal(signals[0].aborted, true, "the 'ah' request was aborted, not left running");
  assert.equal(signals[1].aborted, false);
});
