# Desktop app (Tauri) — runtime contract (SKAI-736)

Status: FROZEN (PM-30.04, gate G4). This documents the shell so a pilot request can be served; no installer is published.

## Runtime contract
- The desktop app is a thin Tauri 2 shell (`src-tauri/`). It bundles only `src-tauri/shell/` (a connect page) and then loads the hosted web app. It holds no school data, no tokens of its own and no offline queue.
- Behaviour parity: every screen, role check, tenant/campus rule and API is the hosted web app's. Nothing in the shell bypasses server-side authorization.
- Hosted URL: `APP_URL` in `src-tauri/shell/shell.js` (default `https://dev.skooleeai.com`). For a production channel, change it to the production origin and add that origin to `app.security.csp.connect-src` in `src-tauri/tauri.conf.json`.
- CSP: the bundled shell page is limited to `'self'` scripts/styles; `connect-src` allows only the hosted origins. No `'unsafe-inline'` / `'unsafe-eval'`.

## Health check and reconnect
- On launch the shell sends `HEAD <APP_URL>/login` (8 s timeout), retrying up to 5 times with exponential backoff (2 s, 4 s, 8 s, 15 s cap).
- On failure it shows "can't be reached" with a focused "Try again" button; the browser `online` event retries automatically.
- Because all mutations happen in the web app (with its own idempotency keys), a reconnect cannot duplicate or lose a server operation. Unsaved form input follows the web app's own draft behaviour.

## Ownership
- Owner: platform (PM-30). Code owner review needed for CSP changes.

## Build
- Dev: `npm run app:desktop:dev` (loads `http://localhost:3000`).
- Release: `npm run app:desktop:build` → `src-tauri/target/release/bundle/` (needs Rust toolchain; Windows/macOS installers must be built on that OS).

## Human actions before release (not code)
1. Apple Developer ID signing + notarization; Windows code-signing certificate.
2. Build and smoke-test installers on macOS and Windows; attach artefacts to the release.
3. Decide distribution channel and production `APP_URL` once a named pilot school requests desktop (G4).
4. QA per the SKAI-736 card: roles, two schools, EN/UR/AR inside the shell.
