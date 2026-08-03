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
  `tsx`, no compile step) owns the actual data:
  - `GET /api/trip` — public, returns the current validated trip JSON.
  - `GET /admin` — HTTP Basic Auth protected, serves a minimal JSON-textarea
    editor (`server/admin-page.ts`).
  - `POST /admin/api/trip` — HTTP Basic Auth protected, validates the body
    against the Zod schema, writes atomically (`.tmp` + rename) and copies
    the previous version to a timestamped backup first (keeps the newest 20,
    prunes older ones). Rejects with `400` and the Zod error message on
    invalid input.
  - Basic Auth credentials come from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env
    vars. If either is unset, admin routes fail closed with `503` rather than
    silently allowing access.
  - Data lives at `DATA_DIR` (default `/data`) on a Docker volume
    (`ibiza_trip_data` in `deploy/docker-compose.yml`), seeded from
    `data/trip.example.json` the first time the container starts with no
    `trip.json` present yet.
- Production: two containers behind the existing Traefik reverse proxy on the
  VPS, same Host (`ibiza.srv1115517.hstgr.cloud`), split by path — Traefik
  routes `/api*` and `/admin*` to the api service (higher router priority)
  and everything else to the frontend/nginx service.
- CI/CD: `.github/workflows/deploy.yml` runs on every push to `main` — builds
  and pushes both images to GHCR (`ghcr.io/felikowski/ibiza-reise-cockpit`
  and `…-api`), then SSHes into the VPS to `docker compose pull && up -d`.
  Requires the `production` GitHub Environment secrets `VPS_SSH_HOST`,
  `VPS_SSH_USER`, `VPS_SSH_PRIVATE_KEY`, plus a non-versioned secret-zero
  file `/etc/ibiza-cockpit/admin.env` on the VPS (`ADMIN_USERNAME`,
  `ADMIN_PASSWORD`) that the deploy workflow does not manage.

## 3. Persistence decision (resolved)

- Reading is fully public and unauthenticated (`GET /api/trip`) — the
  content itself isn't secret, only the ability to change it is.
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
- HTTP Basic Auth over HTTPS (via Traefik/`mytlschallenge`) is the current
  access control for `/admin`. It's adequate for a single-user hobby project;
  if this ever needs multiple admin users or audit logging, that's the point
  to move to something like Authentik/Authelia in front of Traefik instead of
  extending the Express app's own auth.
- Real document/ID numbers still shouldn't go into `trip.json` unless
  strictly necessary, per `AGENTS.md`.

## 5. Ideas for later (not started, not assumed)

- Replace the raw JSON textarea in `/admin` with real per-section forms
  (flights, itinerary days, budget categories, etc.) if editing JSON by hand
  turns out to be too error-prone in practice.
- Multi-trip support (would need a real identifier per trip and likely a
  small database) — only if a second trip is actually planned.
- Surface the automatic backups in the admin UI (list + restore) instead of
  leaving them as an SSH-only safety net.
