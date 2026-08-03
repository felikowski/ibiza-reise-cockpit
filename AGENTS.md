# Codex project instructions

## Project

This repository contains the "Ibiza Reise-Cockpit", a German-language travel
dashboard. The current public deployment is a demo and contains fictional data
only. Communicate with the user in German unless asked otherwise.

## Current architecture

- Next.js 16 and React 19, built through vinext/Vite for OpenAI Sites
- one client-side route in `app/page.tsx`
- custom responsive styling in `app/globals.css`
- no database, API, durable storage, or external data source
- sample trip data is hardcoded in arrays and objects in `app/page.tsx`
- packing state resets on reload
- the existing Sites deployment is public and must remain functional until a
  VPS replacement has been verified

## Primary next objective

Prepare a portable, VPS-hosted version without changing the visual product:

1. Extract all trip content into a typed and validated JSON data model.
2. Preserve every current tab and interaction while reading from that model.
3. Choose the smallest suitable portable runtime. Prefer a static Vite/React
   build for the current read-mostly product; use a server only if write-back is
   explicitly requested.
4. Add a production multi-stage Dockerfile and a local `docker-compose.yml`.
5. Add a GitHub Actions workflow that builds and publishes an image to GHCR.
6. Document a Caddy-based VPS deployment with HTTPS and optional access control.

The detailed handover and acceptance criteria are in `HANDOVER.md`.

## Safety and data rules

- Never commit real booking references, identity document numbers, addresses,
  phone numbers, credentials, tokens, or other personal travel data.
- Keep secrets in ignored local environment files or VPS secret storage.
- If real trip data is stored outside the image, use a read-only mounted volume
  unless server-side editing was explicitly requested.
- Do not remove `.openai/hosting.json`, break the existing Sites deployment, or
  change its access policy during the VPS migration without explicit approval.
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
