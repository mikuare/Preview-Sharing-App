# Development Preview

Drop a component file in, see it render. Anything it imports from npm shows up in a
dependency list you can install with one click — including Tailwind, which is detected
from the markup itself so a design renders the way it was drawn.

Sign in with Google or GitHub first: uploads are saved to your account as **projects**, and each
preview can be published as a link that is either public or limited to people you invite.

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
| Sign in | Google or GitHub. Without a reachable share server the editor falls back to browser-only storage and says so. |
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

### Projects

Everything you upload autosaves to the signed-in account — the **project menu** in the header lists
your workspaces with their file counts, and lets you open, rename, delete or start a new one. A
project holds its files, entry point, installed packages and React version, so reopening it puts
the editor back exactly where you left it. Projects are private to their owner: another account
gets `403`, and a signed-out request gets `401`.

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

| File | Role |
| --- | --- |
| `server/config.js` | Environment, provider availability, serverless detection, boot-time warnings |
| `server/auth.js` | OAuth 2.0 authorization-code flow for both providers, HMAC-signed session cookies |
| `server/store/index.js` | Chooses the storage backend and handles a Supabase outage |
| `server/store/supabase.js` | Supabase Postgres over PostgREST — the production backend |
| `server/store/sqlite.js` | Local SQLite file — development, and the offline fallback |
| `server/store/shared.js` | Slugs, email normalisation, the one access rule |
| `server/app.js` | The Express app: share API, validation and limits |
| `server/index.js` | Local entry point — starts the app listening on `PORT` |
| `api/index.js` | Vercel entry point — mounts the same app as a serverless function |

Sessions are `HttpOnly`, `SameSite=Lax` cookies signed with `SESSION_SECRET` and verified in
constant time; `Secure` switches on automatically when `BASE_URL` is https. OAuth callbacks are
checked against a signed state cookie. Workspaces are capped (`MAX_WORKSPACE_BYTES`, 2 MB
default), and shared preview HTML is only ever rendered inside a sandboxed iframe — never as a
top-level document on the server's origin.

#### Storage

Shares live in **Supabase Postgres** whenever `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
set, and in a local **SQLite** file otherwise. Both backends implement the same interface, so
public/invite visibility, invite matching and owner permissions behave identically on either.

Every database object this app owns is prefixed `preview_`, so the project can be shared with
other applications without collisions.

Schema changes are **CLI migrations**, in `supabase/migrations/`.

The Supabase CLI is deliberately *not* a dependency of this project: its platform binary cannot be
unpacked under `/mnt/c` on WSL, and it has no place in a Vercel build. Install it once, outside the
Windows filesystem:

```bash
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | tar -xz -C ~/.local/bin supabase && chmod +x ~/.local/bin/supabase
supabase --version
```

Then, one-time setup:

```bash
supabase login                 # opens a browser for an access token
npm run db:link                # supabase link --project-ref <your project ref>
npm run db:status              # compare local migrations with the remote history
npm run db:push                # apply anything not yet applied
npm run db:verify              # confirm the objects exist and the key can use them
```

`supabase/preflight.sql` is a separate read-only script for the SQL editor: it reports whether any
of the names the migration wants are already taken, and creates nothing.

The migrations create `preview_users`, `preview_projects`, `preview_shares`,
`preview_share_invites`, `preview_increment_share_views()`, and turn **RLS on with no policies** — the anon key can read
nothing even if it leaks, because only the service role (this server) ever touches those tables.

Two things to know when the project is shared with another app:

- `supabase db push` writes to `supabase_migrations.schema_migrations`, the project-wide migration
  history. If the other app has migrations that are not in this repo, `npm run db:status` will show
  them as remote-only; run `supabase db pull` to bring them in, or
  `supabase migration repair --status applied <version>` to record them, before pushing.
- The CLI needs a database password when linking. It never goes in `.env`, and the app itself does
  not use it — the server only ever talks to PostgREST with the service role key.

Access goes through PostgREST over HTTPS rather than a Postgres connection: a serverless function
that opens a pooled TCP connection per invocation is a good way to exhaust a database. Only
`@supabase/postgrest-js` is used — the full `supabase-js` client eagerly builds a Realtime
WebSocket this app never needs (and that needs a polyfill on Node 20).

**If Supabase is unreachable**, a server with a real disk falls back to the local SQLite file,
keeps working, and reports itself as degraded — in the startup banner, in `/api/me`, and as a
warning in the Share panel. Shares written while degraded are local-only until Supabase returns.
On Vercel that fallback is off by default, because the container's filesystem disappears after the
request: there the API answers `503` with a plain explanation instead of pretending to save.
Override with `ALLOW_LOCAL_FALLBACK`.

#### Deploying to Vercel

The repo is Vercel-shaped already: `vite build` produces the static editor, `api/index.js` runs the
Express app as one Node function, and `vercel.json` routes `/api/*` and `/auth/*` to it while
`/s/*` falls through to the SPA.

1. Push to GitHub and import the repo in Vercel (Vite preset; the build settings come from `vercel.json`).
2. Create a Supabase project, then `npm run db:link && npm run db:push` to apply the migration.
3. Add the environment variables below under **Project → Settings → Environment Variables**.
4. Deploy, then add the deployment URL to both OAuth apps as a redirect/callback URL.

| Variable | Value |
| --- | --- |
| `BASE_URL` | `https://your-app.vercel.app` |
| `APP_ORIGIN` | the same URL |
| `SESSION_SECRET` | a random secret — the server refuses to boot without it in production |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` |

Do **not** set `ALLOW_DEV_LOGIN` on Vercel; it is ignored there in any case. The Supabase anon key
is not needed — the browser never talks to Supabase.

Preview deployments get a different URL each time and neither Google nor GitHub accepts wildcard
redirect URIs, so sign-in works on production and localhost out of the box; to use it on a preview
URL, add that exact URL to the OAuth app and set `BASE_URL`/`APP_ORIGIN` for the preview
environment.

Any Node host with a disk (Fly, Railway, Render, a VPS) still works: `npm run build && npm start`.

## Notes

- Package versions default to `latest` from the npm registry; edit the version field on
  any installed package to pin it.
- The workspace (files, entry, installed packages) is saved to `localStorage`.
- `?sample=dashboard&install=tailwindcss,lucide-react,xlsx` deep-links a demo state.
- The dev server uses a polling file watcher: this project lives on the Windows
  filesystem under WSL, where inotify events never fire.
