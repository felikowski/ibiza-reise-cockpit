# Codex project instructions

## Project

This repository contains the "Ibiza Reise-Cockpit", a German-language travel
dashboard. The current public deployment is a demo and contains fictional data
only. Communicate with the user in German unless asked otherwise.

## Current architecture

- Next.js 16 and React 19, built through vinext/Vite as a static export
  (`output: "export"` in `next.config.ts`) — no Cloudflare Workers, no OpenAI
  Sites, no `wrangler`
- one client-side route in `app/page.tsx`, which fetches trip data from
  `GET /api/trip` at runtime and renders a clear loading/error state around it
- custom responsive styling in `app/globals.css`
- trip data model: `src/domain/trip.ts` (types), `src/domain/validate-trip.ts`
  (Zod schema, shared by the client and the server), `src/domain/derive-trip.ts`
  (countdown, budget totals/percentages, readiness — always derived, never
  duplicated as separate stored constants)
- `data/trip.example.json` — the seed data, copied onto the server's volume
  the first time it starts with no `trip.json` yet
- small Express server in `server/` (own `server/Dockerfile`, runs via `tsx`,
  no build step): `GET /api/trip` (public read), `GET /admin` +
  `POST /admin/api/trip` (HTTP Basic Auth via `ADMIN_USERNAME`/
  `ADMIN_PASSWORD` env vars — fails closed with 503 if unset), atomic writes
  with timestamped backups under `/data/backups/`
- packing checklist state itself still lives in browser state only (resets on
  reload); only the trip *content* is persisted
- two production Docker images: the frontend (nginx serving the static
  export, `Dockerfile`) and the api/admin service (`server/Dockerfile`),
  both deployed to a self-managed VPS behind Traefik at
  `https://ibiza.srv1115517.hstgr.cloud` — Traefik path-routes `/api` and
  `/admin` to the api service, everything else to the frontend
  (`deploy/docker-compose.yml`)
- auto-deployed via GitHub Actions (`.github/workflows/deploy.yml`) on every
  push to `main`: build both images → push to GHCR → SSH deploy
  (`docker compose pull && up -d`)

## Primary next objective

No open migration phase right now — the JSON data model and the editable
admin dashboard are both live. Future work here should be scoped by the user
(e.g. richer per-field admin forms instead of the raw JSON editor, or
multi-trip support) rather than assumed.

## Safety and data rules

- Never commit real booking references, identity document numbers, addresses,
  phone numbers, credentials, tokens, or other personal travel data.
- Keep secrets in ignored local environment files or VPS secret storage.
- If real trip data is stored outside the image, use a read-only mounted volume
  unless server-side editing was explicitly requested.
- Do not change the production Traefik routing/labels in
  `deploy/docker-compose.yml` or the VPS deployment target without explicit
  approval.
- Keep the GitHub repository private unless the user explicitly requests a
  public repository.

## Engineering expectations

- Preserve the current German copy, responsive layout, keyboard behavior, and
  reduced-motion support.
- Define TypeScript types for the travel data. Validate external JSON at the
  boundary and render a clear error state for invalid or missing data.
- Derive countdowns, trip duration, totals, percentages, and progress values
  from data instead of keeping duplicate constants.
- Use atomic writes and backups if JSON write-back is later introduced.
- Run `npm run build` after implementation changes.
- Do not add a database merely for read-only JSON data. Reconsider SQLite when
  multiple trips, users, or concurrent edits become requirements.
