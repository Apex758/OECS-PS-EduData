# Electron Standalone + Auto-Update Plan

> App: Next.js 14 (`oecs-postsec-edudata`). Has server-side API routes (`/api/*`), Postgres (`pg`), Supabase, next-auth — **cannot static-export**. Electron must run a real Next server inside.

## Locked decisions
- **Update host:** GitHub Releases (`publish: github` in electron-builder). Needs `GH_TOKEN` at publish time.
- **Repo visibility:** Public repo recommended for release artifacts (zero client auth). Private = must embed token (leaky).
- **Code signing:** Skip for now. NSIS auto-update works unsigned on Windows; cost is first-run SmartScreen "unknown publisher" warning. Add cert later via config only.

## Architecture
```
Electron main ──spawn──> Next standalone server (127.0.0.1:PORT)
     │                          ↑ API routes, DB, auth all work
     └─ BrowserWindow loads http://127.0.0.1:PORT
     └─ autoUpdater ──checks──> GitHub Releases ──downloads .exe──> installs on quit
```

## Phase 1 — Make Next packageable
1. `next.config.js` → add `output: 'standalone'`. Produces `.next/standalone/server.js` + node_modules subset.
2. Verify standalone runs: `node .next/standalone/server.js` with env loaded.

## Phase 2 — Electron shell
3. Add deps: `electron`, `electron-builder`, `electron-updater`.
4. `electron/main.js`:
   - Pick free port, set `process.env.PORT`.
   - `fork`/`spawn` bundled `server.js`, wait for port ready.
   - Create `BrowserWindow`, load `http://127.0.0.1:PORT`.
   - Kill server child on `window-all-closed`.
5. `electron/preload.js` — minimal, context-isolated.
6. Bundle standalone output + static assets as `extraResources` so `server.js` exists at runtime.

## Phase 3 — Build + updater
7. `electron-builder.yml`:
   - `appId`, Windows target **NSIS** (required for auto-update; not portable .exe).
   - `publish: { provider: github, owner: <you>, repo: <repo> }`.
   - Bundle standalone server in `files` / `extraResources`.
8. `electron/main.js` add `autoUpdater`:
   - `checkForUpdatesAndNotify()` on ready + interval (~30 min).
   - Events: `update-available` → download; `update-downloaded` → prompt/`quitAndInstall`.
9. `package.json` scripts: `electron:dev`, `dist` (build+publish).

## Phase 4 — Remote update pipeline
10. GitHub repo + `GH_TOKEN` env for publish.
11. Release flow: bump `version` in package.json → `electron-builder --publish always` → uploads `.exe` + `latest.yml` to GitHub Release.
12. Installed clients poll `latest.yml`, see higher version, download, auto-install. **This is the remote-update mechanism.**
13. (Optional) GitHub Actions: auto-build+publish on git tag.

## Release loop
```
bump version → npm run dist → electron-builder builds NSIS .exe + latest.yml
→ uploads to GitHub Release → clients poll every 30min → download → install on quit
```

## Caveats / open items
1. **DB + secrets at runtime (BLOCKER for Phase 1 design).** Bundling `.env` ships secrets to every client.
   Decide: desktop app talks to **hosted backend** (Neon/Vercel) vs runs **fully local**. → *unanswered.*
2. **Installer size:** standalone Next + Electron ≈ 150–250 MB.
3. **Port conflicts:** pick free port dynamically.
4. **Version source of truth:** `package.json` version drives updates — bump every release or no update fires.
