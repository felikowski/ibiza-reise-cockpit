# Codex Handover: Ibiza Reise-Cockpit

## 1. Product snapshot

The project is a polished German-language travel dashboard for an Ibiza trip.
It currently uses fictional example data for 12–19 September 2026 and is live
at:

https://ibiza-reise-cockpit-fg.felikowski.chatgpt.site

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
- The current build targets OpenAI Sites through vinext, Vite and the Cloudflare
  plugin.
- There is no persistent storage. The pack list uses React state only.
- The generated demo is public because it contains no real user data.

## 3. Recommended migration

### Phase A — JSON data layer

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

For the first version, choose one of these loading modes explicitly:

- bundled JSON: simplest; changing data creates a new image
- runtime JSON: mount `trip.json` into the container and fetch it at startup

Runtime JSON is the recommended VPS mode because data can be replaced without
rebuilding the application image. Keep the mounted file read-only.

### Phase B — portable app build

The current Cloudflare-oriented runtime is unnecessary for a read-only
dashboard. Prefer a small Vite/React SPA that preserves the existing component
and CSS design. If future requirements need server-side writes or user-specific
data, a standard Node/Next.js runtime is acceptable instead.

Do not remove the existing Sites configuration until the portable build has
feature parity and has been tested.

### Phase C — container

Recommended production shape:

```text
GitHub main branch
  -> GitHub Actions
  -> GHCR image
  -> VPS docker compose
  -> Caddy HTTPS/access control
  -> dashboard container
```

Provide:

- a multi-stage `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- an HTTP health check
- an unprivileged runtime where practical
- a documented read-only mount for runtime `trip.json`
- Caddy configuration examples for public and password-protected operation

### Phase D — automated delivery

Add a GitHub Actions workflow that:

1. installs dependencies with the lockfile
2. runs the production build
3. builds the Docker image
4. publishes versioned and `latest` tags to GHCR

VPS deployment may initially be a documented manual `docker compose pull` and
`docker compose up -d`. Automated SSH deployment can be added separately after
the user confirms the VPS host, account, domain and preferred secret handling.

## 4. Persistence decision

Do not confuse dynamic loading with server-side editing:

- Reading a mounted JSON file requires no application backend.
- Editing and saving JSON from the browser requires a small authenticated API,
  validation, atomic file replacement and backups.
- Multiple trips, users or concurrent edits should move to SQLite or Postgres.
- Per-device UI preferences and packing progress can initially use localStorage.

## 5. Security before real data

Before replacing example content with actual travel data:

- protect the site with Caddy basic auth, Authentik, Authelia or an equivalent
  access layer
- keep the GitHub repository private
- keep the real `trip.json` outside the container image and repository
- avoid storing passport/ID numbers unless strictly necessary
- back up any writable state and test restoration

## 6. Acceptance criteria for the VPS milestone

- all seven tabs match the current demo on desktop and mobile
- dashboard content is loaded from valid JSON
- invalid or absent JSON produces a helpful visible error
- no personal or secret data exists in Git history or the image
- `docker compose up -d` starts a healthy service after a fresh checkout
- HTTPS works through the reverse proxy
- optional access protection is documented and tested
- deployment and rollback instructions are in the README
- the existing Sites deployment remains available until the user approves the
  final cutover

## 7. Suggested prompt for the next Codex task

> Read `AGENTS.md` and `HANDOVER.md` completely. Implement Phase A only: extract
> every hardcoded trip value from the current dashboard into a typed, validated
> example JSON model while preserving the exact interface and interactions.
> Derive countdowns, durations, totals and percentages from the model. Add a
> helpful invalid-data state and run the production build. Do not begin the
> Docker/VPS migration yet.
