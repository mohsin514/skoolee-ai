# Skoolee AI — 5-Platform Roadmap

One React/Next.js codebase, five apps:

| # | Target | Tech | Status |
|---|--------|------|--------|
| 1 | Web | Next.js (existing) | Live at app.skooleeai.com |
| 2 | Android | Capacitor (webview) | Scaffolded — needs Android Studio build |
| 3 | iOS | Capacitor (webview) | Scaffolded — needs macOS + Xcode build |
| 4 | Windows | Tauri | Scaffolded — needs Rust build on Windows |
| 5 | macOS | Tauri | Scaffolded — needs Rust + Xcode build |

## Architecture decision

The Next.js app uses server components, middleware, and cookie-based auth. A plain
static export would lose all of that. So both native shells load the **already
deployed web app** (Capacitor `server.url` mode; Tauri loads the local/dev URL).
This keeps a single source of truth: one repo, one build, five wrappers.

- **Mobile (Capacitor):** the native shell opens `https://app.skooleeai.com` in its
  webview. Auth, SSR and middleware behave exactly like the browser. The app
  requires network, but every fix ships the moment the web deploys — no app-store
  review for feature updates.
- **Desktop (Tauri):** dev builds load `http://localhost:3000` (Next dev). A
  production desktop bundle that works offline is future work (see below) because
  it needs a static export of a server-heavy app.

## Done (in repo)

- [x] Capacitor installed + configured (`capacitor.config.ts`, hosted-URL mode)
- [x] `android/` and `ios/` platform folders added
- [x] Tauri CLI installed + `src-tauri/` scaffolded (Windows/macOS)
- [x] App icons generated for Capacitor + Tauri from the brand mark
- [x] npm scripts + `.gitignore` entries

## To do — on a full toolchain machine

### Android (needs Android Studio / SDK)
```
npm run build            # prisma generate + next build (still required for the web app)
npx cap sync android
npx cap open android     # opens Android Studio → run on emulator/device
```

### iOS (needs macOS with Xcode, and an Apple Developer account to install on a device)
```
npx cap sync ios
npx cap open ios         # opens Xcode → run on simulator/device
```

### Windows (needs Windows machine with Rust)
```
npm install
npx tauri dev            # dev build, loads http://localhost:3000
npx tauri build          # produces NSIS/MSI installer in src-tauri/target/release
```

### macOS (needs Rust + Xcode)
```
npx tauri dev
npx tauri build          # produces .app/.dmg in src-tauri/target/release
```

## Production hardening (later phases)

- [ ] Sign & publish Android to Google Play (needs Play Console, ~$49 one-time)
- [ ] Sign & publish iOS to App Store (needs Apple Developer, $99/yr) + Capacitor push notifications
- [ ] Windows/macOS code-signing certificates for distribution
- [ ] Offline-capable desktop: replace server-bound Next rendering with a static/SPA
      build or an embedded server, so the desktop app works without the internet
- [ ] CI/CD: one pipeline that builds web + mobile + desktop from this repo
