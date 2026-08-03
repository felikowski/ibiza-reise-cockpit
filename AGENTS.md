# Codex project instructions

## Project

This repository contains the "Ibiza Reise-Cockpit", a German-language travel
dashboard. The current public deployment is a demo and contains fictional data
only. Communicate with the user in German unless asked otherwise.

## Current architecture

- Next.js 16 and React 19, built through vinext/Vite as a static export
  (`output: "export"` in `next.config.ts`) — no Cloudflare Workers, no OpenAI
  Sites, no `wrangler`
- one client-side route in `app/page.tsx`
- custom responsive styling in `app/globals.css`
- no database, API, durable storage, or external data source
- sample trip data is hardcoded in arrays and objects in `app/page.tsx`
- packing state resets on reload
- `npm run build` produces a fully static bundle at `dist/client/`, served by
  nginx in the production Docker image (see `Dockerfile`)
- deployed to a self-managed VPS behind Traefik at
  `https://ibiza.srv1115517.hstgr.cloud`, auto-deployed via GitHub Actions
  (`.github/workflows/deploy.yml`) on every push to `main`: build image →
  push to GHCR → SSH deploy (`docker compose pull && up -d`)

## Primary next objective

Extract the hardcoded trip content into a typed and validated JSON data
model, without changing the visual product:

1. Extract all trip content into a typed and validated JSON data model
   (`data/trip.example.json` + validation, see `HANDOVER.md`).
2. Preserve every current tab and interaction while reading from that model.
3. Since the app is a static export, prefer bundling the JSON at build time
   for the first version; only add a small server/API if write-back is
   later explicitly requested (that would also require moving off
   `output: "export"`).

The detailed handover and acceptance criteria are in `HANDOVER.md`.

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
