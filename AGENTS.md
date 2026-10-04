# Repository Guidelines

## Project Structure & Module Organization

This repository is a private API key vault with Electron desktop and Node.js web versions. The desktop process and secure storage logic live in `main.js`; `preload.js` exposes the limited renderer bridge, and `app.js` contains the UI behavior. `web-server.js` serves the PostgreSQL-backed web app. Shared markup and presentation are in `index.html`, `styles.css`, and `theme.css`. Tests are in `tests/` (`*.test.js`), with provider connection-check logic in `tests-api.js`. Static icons and platform assets are in `assets/`; icon generation scripts are in `scripts/`.

## Build, Test, and Development Commands

- `npm install` installs dependencies (Node.js 22+).
- `npm start` launches the Electron desktop app.
- `DATABASE_URL='postgres://…' npm run web` starts the web app on localhost; configure PostgreSQL first.
- `npm run check` runs Node syntax checks on application and API test modules.
- `npm test` runs the Node built-in test runner against `tests/*.test.js`.
- `npm run package -- --mac --arm64` packages a macOS build; use `--win --x64` or `--linux --x64` on the corresponding platform.
- `npm run icons` and `npm run platform-icons` regenerate bundled icons; the latter requires ImageMagick.

## Coding Style & Naming Conventions

Use the existing CommonJS style and plain JavaScript, with two-space indentation, semicolons, and single-quoted strings. Keep desktop IPC handlers and web routes explicit about validation and vault lock state. Name tests `*.test.js` and describe behavior in test names. Keep platform-specific artwork under its matching `assets/platform/<platform>/` directory. No formatter or linter is configured; follow surrounding code style.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`; run `npm test` after behavior changes and `npm run check` for syntax validation. Add or update tests for security-sensitive storage, encryption, lock/unlock, and API behavior. Tests that call provider endpoints use real network connections and should only be run when intended; the current desktop test stubs Electron and exercises encrypted persistence.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so no established commit prefix convention can be confirmed. Use a short imperative commit subject, such as `Handle vault lock timeout`. Pull requests should explain the user-visible change, note security or configuration effects, list checks run, and include screenshots for UI changes. Link related issues when applicable.

## Security & Configuration

Never commit API keys, passwords, database URLs, or vault databases. Keep web deployments behind HTTPS and access controls, and bind to localhost for development. See `README.md` for database and deployment configuration details.
