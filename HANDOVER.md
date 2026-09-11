# Codex Handover: Ibiza Reise-Cockpit

## 1. Product snapshot

The project is a polished German-language travel dashboard for an Ibiza trip.
It currently uses fictional example data for 9–16 September 2026 and is live
at:

https://ibiza.srv1115517.hstgr.cloud

Implemented sections:

- Übersicht: countdown, next flight, weather glimpse, week preview, readiness and budget
- Reiseplan: selectable days with a detailed timeline
- Buchungen: flights, accommodation, rental car and copyable references
- Entdecken: filterable places and a stylized map
- Wetter: live daily forecast for the destination, plus four Berlin reference
  days (departure, arrival, return flight, day after)
- Budget: totals, categories and payment status
- Packen: interactive checklist
- Dokumente & Infos: document status, practical facts and emergency contacts

All of the above is now backed by a typed, validated, editable JSON model —
see sections 2 and 3.

## 2. Technical snapshot

- `app/page.tsx` is a client component containing the UI and interactions. It
  fetches trip data from `GET /api/trip` on mount, validates it again on the
  client (`src/domain/validate-trip.ts`), and shows a loading/error state
  around the dashboard rather than assuming the data is always present.
- `app/globals.css` contains the complete visual system and responsive rules.
- `src/domain/trip.ts` / `validate-trip.ts` / `derive-trip.ts` are the single
  source of truth for the data shape and every computed value (countdown,
  trip duration, budget totals/percentages, readiness score, packing
  progress). Nothing is stored as a duplicate hardcoded constant anymore.
- The frontend still builds as a plain static export (`output: "export"`,
  `vinext build` → `dist/client/`), served by nginx (`Dockerfile`,
  `deploy/nginx.conf`). It has no server-side rendering and no direct
  filesystem access — it only talks to the api service over HTTP.
- A small Express server (`server/index.ts`, own `server/Dockerfile`, run via
  `tsx`, no compile step) owns the actual data and the whole app's
  authentication:
  - `server/auth.ts` wraps `express-openid-connect` (Auth0's official Express
    SDK). `app.use(authMiddleware())` mounts `req.oidc` plus `/auth/login`,
    `/auth/logout`, `/auth/callback`; `app.use(requireLogin)` right after it
    means every route registered afterwards requires a valid session.
  - `GET /api/trip` — requires login, returns the current validated trip
    JSON.
  - `GET /admin` — requires login, serves a minimal JSON-textarea editor
    (`server/admin-page.ts`).
  - `POST /admin/api/trip` — requires login, validates the body against the
    Zod schema, writes atomically (`.tmp` + rename) and copies the previous
    version to a timestamped backup first (keeps the newest 20, prunes
    older ones). Rejects with `400` and the Zod error message on invalid
    input.
  - `GET /auth/verify` — the Traefik `forwardAuth` target for the *static*
    frontend container, which has no code of its own to check a session:
    200 if `req.oidc.isAuthenticated()`, otherwise a redirect to
    `/auth/login` (Traefik relays that redirect straight to the browser
    without ever reaching nginx).
  - `GET /auth/me` — returns `{ email, name }` from the session (or nulls),
    used by `app/app-shell.tsx` to show who's logged in and offer a logout
    link. Not itself gated by `requireLogin` — it degrades to nulls instead.
  - All five `AUTH0_SECRET`/`AUTH0_BASE_URL`/`AUTH0_CLIENT_ID`/
    `AUTH0_CLIENT_SECRET`/`AUTH0_ISSUER_BASE_URL` env vars are required; if
    any is unset, every route except `/healthz` fails closed with `503`
    (same pattern as the old Basic-Auth fail-closed behavior).
  - Auth0 users are managed entirely in the Auth0 tenant (Dashboard → User
    Management), not in this repo — there's no user list or role model in
    code. Anyone with a valid Auth0 session for this Application can read
    and edit everything, same blast radius as the old shared Basic-Auth
    password.
  - Data lives at `DATA_DIR` (default `/data`) on a Docker volume
    (`ibiza_trip_data` in `deploy/docker-compose.yml`), seeded from
    `data/trip.example.json` the first time the container starts with no
    `trip.json` present yet.
- Production: two containers behind the existing Traefik reverse proxy on the
  VPS, same Host (`ibiza.srv1115517.hstgr.cloud`), split by path — Traefik
  routes `/api*`, `/admin*` and `/auth*` to the api service (higher router
  priority) and everything else to the frontend/nginx service. The
  frontend's router additionally carries a `forwardAuth` middleware pointing
  at the api container's `/auth/verify`, since nginx itself can't check a
  session.
- CI/CD: `.github/workflows/deploy.yml` runs on every push to `main` — builds
  and pushes both images to GHCR (`ghcr.io/felikowski/ibiza-reise-cockpit`
  and `…-api`), then SSHes into the VPS to `docker compose pull && up -d`.
  Requires the `production` GitHub Environment secrets `VPS_SSH_HOST`,
  `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`, plus a non-versioned secret-zero
  file `/etc/ibiza-cockpit/admin.env` on the VPS (`ADMIN_USERNAME`,
  `ADMIN_PASSWORD`) that the deploy workflow does not manage.

## 3. Persistence decision (resolved)

- Reading used to be fully public and unauthenticated (`GET /api/trip`); as
  of the Auth0 integration (section 4) the whole app, including reads, is
  behind login — real trip data (bookings, names) is expected to replace
  the fictional demo data, so nothing is public anymore.
- Editing goes through a small authenticated API with server-side Zod
  validation, atomic file replacement and automatic backups — exactly the
  bar `AGENTS.md` set before write-back was allowed.
- No database was introduced. A single JSON file on a volume is still enough
  for one trip. Revisit SQLite/Postgres only if multiple trips, multiple
  independent users, or concurrent-edit conflict handling become real
  requirements.
- Packing-checklist ticks are intentionally still client-only state — they
  reset on reload. Only the trip *content* (flights, budget, itinerary, etc.)
  is meant to be edited and persisted through `/admin`.

## 4. Security notes

- The GitHub repository and both GHCR packages should stay set to the access
  level the user wants once the data stops being fictional — packages were
  made public early on for simplicity while only demo data existed; revisit
  before real personal data goes into `trip.json`.
- Auth0 (OIDC via `express-openid-connect`, see section 2) now protects the
  whole app — both the static frontend (via Traefik `forwardAuth` calling
  `/auth/verify`) and the API/admin routes (checked directly in Express).
  This replaced the old shared HTTP Basic Auth password on `/admin`, giving
  each of the (currently three) users their own Auth0 account instead of one
  shared credential.
  - There's no role model: any authenticated user can read and edit
    everything, same as the old shared password — Auth0 accounts are only
    about *who* can log in, not about differing permissions between the
    three of them.
  - Users are added/removed entirely in the Auth0 dashboard (Database
    Connection under Applications), not in this repo.
  - The session cookie is encrypted with `AUTH0_SECRET`; treat it like any
    other credential (long random value, not committed, rotated by changing
    it in `/etc/ibiza-cockpit/admin.env` on the VPS and restarting the api
    container).
- Real document/ID numbers still shouldn't go into `trip.json` unless
  strictly necessary, per `AGENTS.md`.

## 5. Ideas for later (not started, not assumed)

- Per-user roles (e.g. read-only vs. edit access) if the three users ever
  need different permissions — would mean checking `req.oidc.user` claims
  instead of just `requiresAuth()`, and assigning roles in Auth0.

- Replace the raw JSON textarea in `/admin` with real per-section forms
  (flights, itinerary days, budget categories, etc.) if editing JSON by hand
  turns out to be too error-prone in practice.
- Multi-trip support (would need a real identifier per trip and likely a
  small database) — only if a second trip is actually planned.
- Surface the automatic backups in the admin UI (list + restore) instead of
  leaving them as an SSH-only safety net.
