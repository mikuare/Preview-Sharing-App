# Development Preview

Drop a component file in, see it render. Anything it imports from npm shows up in a
dependency list you can install with one click — including Tailwind, which is detected
from the markup itself so a design renders the way it was drawn.

```bash
npm install
npm run dev       # editor only          → http://localhost:5173
npm run dev:all   # editor + share server → http://localhost:5173 (API proxied to :8787)
```

For a deployed instance: `npm run build && npm start` — the share server then serves the
built app, sign-in, and `/s/:slug` links on one port.

## How it works

Nothing is written to disk and there is no bundler step at runtime:

| Stage | What happens |
| --- | --- |
| Upload | Files are read in the browser (drag a file, several files, or a folder). |
| Detect | `src/lib/detect.js` scans imports for npm packages and scores the markup for Tailwind utility classes. |
| Install | `src/lib/registry.js` resolves the version against the npm registry and pins it into an import map served by esm.sh. Tailwind instead injects its browser compiler. |
| Compile | `src/lib/compile.js` runs Babel in the browser (JSX + TypeScript), rewrites relative imports, and orders modules dependency-first. |
| Preview | `src/lib/buildPreview.js` assembles a standalone HTML document — import map, styles, modules, loader — that runs in a sandboxed iframe. |

The preview iframe is sandboxed without `allow-same-origin`, so uploaded code cannot
reach this app's storage. Console output and errors are posted back to the host and
shown in the console panel.

## What it handles

- `.jsx`, `.tsx`, `.js`, `.ts` — a single file or a whole project folder
- Relative imports between uploaded files, resolved with or without extensions
- `import './styles.css'` — the stylesheet is injected into the preview document
- A `tailwind.config.js` in the upload is applied to the Tailwind v3 runtime
- Entry point detection (a file that mounts itself, or `main`/`index`/`App`, or the
  file nobody imports); override it with the **entry** button on any file
- React 18 or 19, switchable in the header — every installed package is pinned to the
  same React instance via `?external=react`

## Sharing

**Open ↗** in the preview bar opens the built preview as its own browser tab (if the browser
blocks it, the bar says so — allow pop-ups and click again).

**Share** in the header offers two ways out of this machine:

- **Standalone HTML file** — the built preview as one self-contained page. Send it to anyone;
  they open the file and it renders. No install, no server, no account. It pulls React and any
  installed packages from esm.sh at runtime, so the viewer needs internet.
- **Workspace link** — files, entry point and installed packages gzipped into the URL hash.
  Opens in any running copy of Development Preview, editable on the other end. The Tailwind
  dashboard sample packs to a ~2.4k-character link.

Neither of those needs a backend.

### Hosted links with Google / GitHub sign-in

With the share server running, **Share → Hosted link** saves the preview server-side and hands
back a short link like `https://your-host/s/kj7nyx64qc`. Each link is either:

- **Anyone with the link** — opens for everybody, signed in or not.
- **Only people I invite** — you list email addresses; a visitor signs in with Google or GitHub
  and is let through only if the address on that account is on the list. Anyone else sees
  "not on the invite list", never the preview.

The viewer page needs nothing installed: it renders the stored snapshot of the preview in the
same sandboxed iframe the editor uses, and offers **Open a copy in the editor** for anyone who
wants to take it further. Shares saved without a snapshot are rebuilt in the viewer's browser,
which is slower but keeps old links working.

#### Setting up sign-in

1. `cp .env.example .env` and set `SESSION_SECRET` (`node -e "console.log(crypto.randomUUID())"`)
   and `BASE_URL` to the address the server is reachable at.
2. **Google** — console.cloud.google.com → APIs & Services → Credentials → *Create OAuth client
   ID* → Web application. Add `{BASE_URL}/auth/google/callback` as an authorised redirect URI.
   Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
3. **GitHub** — github.com/settings/developers → *New OAuth App*. Set the callback URL to
   `{BASE_URL}/auth/github/callback`. Copy the values into `GITHUB_CLIENT_ID` /
   `GITHUB_CLIENT_SECRET`.
4. Restart the server. It prints which providers are live on boot.

Either provider alone is enough; configure both and the viewer offers both buttons. For local
work without registering anything, set `ALLOW_DEV_LOGIN=1` to sign in as any address you type —
it is refused whenever `NODE_ENV=production` and should never be set on a deployed instance.

#### How the server is put together

`server/` is Express + SQLite (`data/shares.db`), roughly 500 lines:

| File | Role |
| --- | --- |
| `server/config.js` | Environment, provider availability, boot-time warnings |
| `server/auth.js` | OAuth 2.0 authorization-code flow for both providers, HMAC-signed session cookies |
| `server/db.js` | Schema, share CRUD, invite list, the access decision |
| `server/index.js` | Share API, validation and limits, serves the built app and `/s/:slug` |

Sessions are `HttpOnly`, `SameSite=Lax` cookies signed with `SESSION_SECRET` and verified in
constant time; `Secure` switches on automatically when `BASE_URL` is https. OAuth callbacks are
checked against a signed state cookie. Workspaces are capped (`MAX_WORKSPACE_BYTES`, 2 MB
default), and shared preview HTML is only ever rendered inside a sandboxed iframe — never as a
top-level document on the server's origin.

#### Deploying

Any host that runs Node and keeps a disk will do (Fly.io, Railway, Render, a VPS). Build first,
set `BASE_URL` to the public URL, register that URL in both OAuth apps, and run `npm start`.
Keep `data/` on a persistent volume — that is where the shares live.

## Notes

- Package versions default to `latest` from the npm registry; edit the version field on
  any installed package to pin it.
- The workspace (files, entry, installed packages) is saved to `localStorage`.
- `?sample=dashboard&install=tailwindcss,lucide-react,xlsx` deep-links a demo state.
- The dev server uses a polling file watcher: this project lives on the Windows
  filesystem under WSL, where inotify events never fire.
