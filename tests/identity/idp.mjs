// SKO-446 synthetic OpenID Connect provider for the isolated test (never used outside it).
// /authorize takes login_hint = base64url(JSON claims). Control: /_mode?m=ok|down|wrongIssuer.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
const PORT = 55465, ISS = `http://127.0.0.1:${PORT}`;
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const codes = new Map();
let mode = "ok";
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
createServer((req, res) => {
  const u = new URL(req.url, ISS);
  if (u.pathname === "/_mode") { mode = u.searchParams.get("m") || "ok"; return res.end(mode); }
  if (u.pathname === "/.well-known/openid-configuration") return json(res, 200, { issuer: mode === "wrongIssuer" ? "http://127.0.0.1:1/other" : ISS, authorization_endpoint: `${ISS}/authorize`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks`, id_token_signing_alg_values_supported: ["RS256"] });
  if (u.pathname === "/jwks") return json(res, 200, { keys: [jwk] });
  if (u.pathname === "/authorize") {
    const claims = JSON.parse(Buffer.from(u.searchParams.get("login_hint") || "e30", "base64url").toString());
    const code = randomBytes(12).toString("hex");
    codes.set(code, { claims, nonce: u.searchParams.get("nonce"), challenge: u.searchParams.get("code_challenge"), clientId: u.searchParams.get("client_id"), redirect: u.searchParams.get("redirect_uri") });
    const back = new URL(u.searchParams.get("redirect_uri")); back.searchParams.set("code", code); back.searchParams.set("state", u.searchParams.get("state"));
    res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (u.pathname === "/token" && req.method === "POST") {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => {
      if (mode === "down") return json(res, 503, { error: "temporarily_unavailable" });
      const p = new URLSearchParams(body), c = codes.get(p.get("code"));
      if (!c) return json(res, 400, { error: "invalid_grant" });
      codes.delete(p.get("code"));
      if (createHash("sha256").update(p.get("code_verifier") || "").digest("base64url") !== c.challenge) return json(res, 400, { error: "invalid_grant", error_description: "PKCE" });
      if (p.get("client_id") !== c.clientId || p.get("redirect_uri") !== c.redirect) return json(res, 400, { error: "invalid_client" });
      const aud = c.claims.__aud || c.clientId;
      const idToken = await new SignJWT({ ...c.claims, __aud: undefined, nonce: c.claims.__nonce || c.nonce }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(c.claims.__iss || ISS).setAudience(aud).setSubject(c.claims.sub).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      json(res, 200, { access_token: "synthetic", token_type: "Bearer", id_token: idToken });
    });
    return;
  }
  json(res, 404, { error: "not_found" });
}).listen(PORT, "127.0.0.1", () => console.log("idp ready"));
