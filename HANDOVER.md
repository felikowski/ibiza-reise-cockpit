# Codex Handover: Ibiza Reise-Cockpit

## 1. Product snapshot

The project is a polished German-language travel dashboard for an Ibiza trip.
It currently uses fictional example data for 12–19 September 2026 and is live
at:

https://ibiza.srv1115517.hstgr.cloud

Implemented sections:

- Übersicht: countdown, next flight, weather, week preview, readiness and budget
- Reiseplan: selectable days with a detailed timeline
- Buchungen: flights, accommodation, rental car and copyable references
- Entdecken: filterable places and a stylized map
- Budget: totals, categories and payment status
- Packen: interactive checklist
- Dokumente & Infos: document status, practical facts and emergency contacts

## 2. Technical snapshot

- `app/page.tsx` is a client component containing the UI, interactions and all
  example data.
- `app/globals.css` contains the complete visual system and responsive rules.
- The app builds as a plain static export (`output: "export"`, `vinext build`)
  to `dist/client/` — no Cloudflare Workers, no OpenAI Sites, no server
  runtime.
- There is no persistent storage. The pack list uses React state only.
- Production: `Dockerfile` builds the static export and serves it with nginx
  (config in `deploy/nginx.conf`). `deploy/docker-compose.yml` runs it on the
  VPS behind the existing Traefik reverse proxy (`root_default` network,
  `mytlschallenge` certresolver), reachable at
  `https://ibiza.srv1115517.hstgr.cloud`.
- CI/CD: `.github/workflows/deploy.yml` runs on every push to `main` — builds
  and pushes the image to GHCR (`ghcr.io/felikowski/ibiza-reise-cockpit`),
  then SSHes into the VPS to `docker compose pull && up -d`. Requires the
  `production` GitHub Environment secrets `VPS_SSH_HOST`, `VPS_SSH_USER`,
  `VPS_SSH_PRIVATE_KEY`.

## 3. Remaining migration: JSON data layer

Create one canonical model, for example:

```text
data/trip.example.json
src/domain/trip.ts
src/domain/validate-trip.ts
```

The model should cover:

- trip metadata, dates and travelers
- outbound and return journeys
- accommodation and transport bookings
- itinerary days and timeline entries
- saved places and categories
- budget categories, payments and currency
- packing groups and items
- documents, emergency contacts and practical facts

All computed UI values must be derived from this model. Do not put secrets or
real document identifiers in the example JSON.

Since the app is a static export, the simplest loading mode is bundling the
JSON at build time (import it directly, validate once during the build/render
path). Runtime-mounted JSON is possible later (fetch it client-side from a
file the nginx container also serves from a mounted volume) if the data needs
to change without rebuilding the image — revisit only if that becomes a real
requirement.

## 4. Persistence decision

Do not confuse dynamic loading with server-side editing:

- Reading a bundled or mounted JSON file requires no application backend.
- Editing and saving JSON from the browser requires a small authenticated API,
  validation, atomic file replacement and backups — that would also mean
  moving off `output: "export"` to a Node runtime.
- Multiple trips, users or concurrent edits should move to SQLite or Postgres.
- Per-device UI preferences and packing progress can initially use localStorage.

## 5. Security before real data

Before replacing example content with actual travel data:

- protect the site with Caddy/Traefik basic auth, Authentik, Authelia or an
  equivalent access layer (not yet set up)
- keep the GitHub repository private
- keep any real `trip.json` outside the container image and repository if it
  ever contains sensitive data
- avoid storing passport/ID numbers unless strictly necessary
- back up any writable state and test restoration

## 6. Acceptance criteria for the JSON data model milestone

- all seven tabs match the current demo on desktop and mobile
- dashboard content is loaded from valid JSON
- invalid or absent JSON produces a helpful visible error
- no personal or secret data exists in Git history or the image
- `npm run build` and the Docker image build succeed after the change
- the production deployment still matches the pre-change UI after the next
  push to `main`

## 7. Suggested prompt for the next Codex task

> Read `AGENTS.md` and `HANDOVER.md` completely. Extract every hardcoded trip
> value from the current dashboard into a typed, validated example JSON model
> while preserving the exact interface and interactions. Derive countdowns,
> durations, totals and percentages from the model. Add a helpful
> invalid-data state and run `npm run build`.
