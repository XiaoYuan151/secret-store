# Secret Store

A quiet, local-first vault for API keys. The desktop app uses SQLite. The web app uses PostgreSQL. In both, key records are AES-256-GCM encrypted before they are written to the database; the database contains opaque IDs and encrypted payloads. The password-derived key is held only while the vault is unlocked.

## Desktop

Requires Node.js 22+ to install dependencies and run Electron.

```sh
npm install
npm start
```

On first launch, create a password of at least 12 characters. There is no password recovery. Back up the database and remember your password. The database is in Electron's user data directory as `vault.sqlite`. On macOS, Touch ID can be enabled from the sidebar after setup. The vault locks after 15 minutes of inactivity.

## Web

Requires a running PostgreSQL database and Node.js 22+.

```sh
npm install
DATABASE_URL='postgres://user:password@localhost:5432/secret_store' npm run web
```

Open <http://127.0.0.1:3000>. Tables are created automatically. This is a **single-vault** service: the first visitor sets the password. Keep it bound to localhost unless you put it behind HTTPS with access controls. For an HTTPS deployment set `HOST`, `PUBLIC_ORIGIN` (for example `https://vault.example.com`), and `COOKIE_SECURE=1`. PostgreSQL should use TLS for a remote database connection. The web service keeps unlocked keys in process memory for active sessions, which expire after 15 minutes of inactivity.

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

The application does not recover a lost password. Local database backups must include the password to remain useful. Encryption covers key records, while SQLite/PostgreSQL table names and random row IDs remain visible. The web server should not be exposed directly to the public Internet. The product does not currently include WebAuthn passkeys or system notifications; expiration reminders appear in the app. Touch ID support is macOS desktop only.

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
