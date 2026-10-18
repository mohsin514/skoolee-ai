// SKO-445 synthetic webhook consumer for the isolated test: records every request, applies each event id once.
// Control: GET /_mode?m=ok|slow|500|429|redirect · GET /_log → { received, applied }.
import { createServer } from "node:http";
const received = [], applied = new Set();
let mode = "ok";
createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/_mode") { mode = u.searchParams.get("m") || "ok"; res.end(mode); return; }
  if (u.pathname === "/_log") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ received, applied: [...applied] })); return; }
  let body = ""; req.on("data", c => { body += c; });
  req.on("end", () => {
    const id = String(req.headers["skoolee-event-id"] ?? "");
    received.push({ id, signature: String(req.headers["skoolee-signature"] ?? ""), body, attempt: String(req.headers["skoolee-delivery-attempt"] ?? "") });
    applied.add(id);
    if (mode === "slow") { setTimeout(() => res.writeHead(200).end("ok"), 3000); return; }
    if (mode === "500") { res.writeHead(500).end("boom"); return; }
    if (mode === "429") { res.writeHead(429, { "Retry-After": "120" }).end("slow down"); return; }
    if (mode === "redirect") { res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" }).end(); return; }
    res.writeHead(200).end("ok");
  });
}).listen(55463, "127.0.0.1", () => console.log("receiver ready"));
