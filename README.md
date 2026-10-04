# Secret Store

A quiet, local-first vault for API keys. The desktop app uses SQLite. The web app uses PostgreSQL or Cloudflare D1. In both, key records are AES-256-GCM encrypted before they are written to the database; the database contains opaque IDs and encrypted payloads. The password-derived key is held only while the vault is unlocked.

## Desktop

Requires Node.js 22+ to install dependencies and run Electron.

```sh
npm install
npm start
```

On first launch, create a password of at least 12 characters. There is no password recovery. Back up the database and remember your password. The database is in Electron's user data directory as `vault.sqlite`. On macOS, Touch ID can be enabled from the sidebar after setup. The vault locks after 15 minutes of inactivity.

## Web

The web app is a **single-vault** service: the first visitor creates its password. Deploy behind HTTPS and access controls so only intended users can reach setup and unlock. Back up the database and remember the password; there is no recovery path. Key payloads are AES-256-GCM encrypted. Active session keys are stored encrypted in the database so sessions work across instances. Sessions expire after 15 minutes of inactivity; locking removes the session record. Keep `SESSION_SECRET` stable and private, since changing it invalidates all active sessions. Generate one with `openssl rand -hex 32`.

### VPS + PostgreSQL

Requires Node.js 22+ and PostgreSQL. Tables are created on startup.

```sh
npm install
SESSION_SECRET='<64-character-random-hex>' DATABASE_URL='postgres://user:password@localhost:5432/secret_store' npm run web
```

The server listens on `127.0.0.1:3000` by default. Place an HTTPS reverse proxy in front, then set `PUBLIC_ORIGIN=https://vault.example.com` and `COOKIE_SECURE=1`. Set `HOST` and `PORT` if necessary. Use TLS for remote PostgreSQL connections. Point the reverse proxy at the local listener and allow only the intended users to access it.

### Vercel + Supabase

Create a Supabase PostgreSQL project. In its **Connect** panel, copy the **transaction pooler** connection string (port 6543) for serverless use. Import this repository as a Vercel project with **Framework Preset: Other** and the repository root as the root directory. The `api/` functions and generated `public/` assets deploy together; `vercel.json` runs the asset build and limits the static output to `public/`. Configure environment variables in Vercel:

- `DATABASE_URL`: the Supabase transaction pooler URL, with the password URL encoded and TLS required (`sslmode=require`).
- `SESSION_SECRET`: the random value generated above.
- `PUBLIC_ORIGIN`: the exact HTTPS Vercel or custom domain origin, with no trailing slash.

Deploy. The functions create the PostgreSQL tables when first invoked. For production, use a custom domain and restrict access before sharing the URL. Keep `SESSION_SECRET` and `DATABASE_URL` server side; never expose them with a `NEXT_PUBLIC_` prefix.

### Cloudflare Workers + D1

Use a Workers Paid plan for the password setup and unlock CPU work; the [Free plan’s 10 ms CPU limit](https://developers.cloudflare.com/workers/platform/limits/) is too small for the existing scrypt parameters. Create a D1 database named `secret-store` with Wrangler. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml` with its database ID. Apply `migrations/0001_init.sql` before deploying:

```sh
npx wrangler d1 create secret-store
npx wrangler d1 migrations apply secret-store --remote
npx wrangler secret put SESSION_SECRET
npx wrangler secret put PUBLIC_ORIGIN
npm run web:assets
npx wrangler deploy
```

Set `PUBLIC_ORIGIN` to the exact HTTPS Workers or custom domain origin. For local D1 testing, run `npx wrangler d1 migrations apply secret-store --local`, then `npm run web:assets` and `npx wrangler dev`. The Worker uses the `DB` D1 binding and serves the generated `public/` directory. Rebuild assets after UI changes. Configure Cloudflare Access or equivalent access controls before sharing the URL.

## Features

- Search by platform, label, account, ID, or tag; filter by platform, tag, and expiring keys. Search also offers quick-add suggestions for supported application types.
- Search updates while typing. The search field stays centered in the toolbar; Command/Ctrl+K still focuses it.
- Switch between light and dark appearance. The initial appearance follows the operating system; a manual choice is saved on this device.
- Application categories and platform names in the sidebar are sorted alphabetically.
- Copy a secret, a quoted `.env` assignment, or a JSON object. Desktop clipboard contents clear after 30 seconds if unchanged.
- Add custom platforms with the + beside Other. Adding a platform asks only for its name and stores it encrypted, even before it has any keys. Organize keys with tags for regional or product-specific distinctions. The new-key form keeps extra fields under More details.
- Open Settings with the gear button in the top right to choose an appearance, manage Touch ID when available, or lock the vault.
- Track expiration dates. The app highlights keys within 30 days of expiry.
- Read-only connection checks for GitHub, GitLab, Hugging Face, OpenAI, OpenRouter, DeepSeek, and Cloudflare. Tests contact those providers with the selected key, so run them only when you want that connection.

## Security boundaries

The application does not recover a lost password. Local database backups must include the password to remain useful. Encryption covers key records, while SQLite/PostgreSQL/D1 table names and random row IDs remain visible. The web server should not be exposed directly to the public Internet. The product does not currently include WebAuthn passkeys or system notifications; expiration reminders appear in the app. Touch ID support is macOS desktop only.

## Icons

Platform marks come from **Font Awesome Free**, bundled as small local SVGs with no CDN dependency. The icon license and attribution are in `assets/fontawesome/LICENSE.txt`. Platforms without a Font Awesome brand mark use a neutral Font Awesome symbol. Regenerate the bundled marks with `npm run icons`.

The app icon exports are under `assets/platform`:

- **macOS:** `macos/AppIcon.icns` for Electron and separate square background/foreground SVG layers in `apple/` for Icon Composer. The Dock icon has transparent inset for the standard visual size and follows the active appearance.
- **Windows:** a multi-resolution ICO plus 44 px and 150 px logo assets at 100%, 200%, and 400% scales.
- **Linux:** PNG sizes and a scalable SVG in the freedesktop `hicolor` layout.
- **iOS:** an `AppIcon.appiconset` with opaque, unmasked 1024 px light and dark icons. These are assets for a future iOS target; this repository does not contain an iOS app.

The sources and exports preserve one key silhouette across platforms. Regenerate them with `npm run platform-icons` (requires ImageMagick). Apple’s current layered effects require importing the `apple/` SVG layers into Icon Composer for an Apple-platform build. References: [Apple app icons](https://developer.apple.com/design/human-interface-guidelines/app-icons), [Windows app icons](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-design), and the [freedesktop icon theme specification](https://specifications.freedesktop.org/icon-theme/0.8/).

## Desktop releases

The `.github/workflows/release.yml` workflow builds macOS (Apple Silicon and Intel), Windows, and Linux packages when a `v<version>` tag is pushed. The tag must match `package.json` (for example, `v1.0.0`). It runs checks and tests, then attaches the packages to a GitHub Release. To build locally, run `npm run package -- --mac --arm64` (or `--win --x64` / `--linux --x64`) on the corresponding operating system.

The workflow has no signing or notarization credentials, so its packages are unsigned. Add platform signing credentials before distributing through channels that require trusted installers.
