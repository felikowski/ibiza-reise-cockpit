# Ibiza Reise-Cockpit

Interaktives Dashboard für eine Ibiza-Reise mit Reiseplan, Buchungen,
Entdeckungen, Budget, Packliste sowie Dokumenten und Notfallinformationen.

Läuft produktiv unter:
[ibiza.srv1115517.hstgr.cloud](https://ibiza.srv1115517.hstgr.cloud)

> Die Demo enthält ausschließlich frei erfundene Beispieldaten.

## Aktueller Stand

- responsive Einseiter-App mit sieben Bereichen
- auswählbarer Tagesplan
- filterbare Orte
- kopierbare Buchungsnummern
- interaktive Packliste
- eigener Wetter-Tab mit Live-Daten von [Open-Meteo](https://open-meteo.com)
  für das Reiseziel (Tag für Tag) und vier Vergleichstage in Berlin (Abflug,
  Ankunft, Rückflug, Tag danach) — echte Vorhersage innerhalb von ~15 Tagen,
  sonst ein klar gekennzeichneter Ø-Wert der letzten 5 Jahre
- alle Reisedaten kommen aus einem typisierten, validierten JSON-Modell
  (`src/domain/trip.ts` + `src/domain/validate-trip.ts`), Countdown, Budget-
  und Bereitschafts-Prozente werden daraus abgeleitet statt hart codiert
- **zwei Container**: das statische Frontend (nginx) und ein kleiner
  API-/Admin-Server, der die Daten auf einem Volume persistiert und über
  eine editierbare Oberfläche verfügbar macht
- **Login für das ganze Dashboard über Auth0** (OAuth/OIDC): sowohl das
  Frontend als auch die API/Admin-Oberfläche sind nur mit einem gültigen
  Auth0-Account erreichbar — kein öffentliches Lesen mehr
- automatisches Deployment: jeder Push auf `main` baut beide Images,
  published sie nach GHCR und deployed sie per SSH auf den VPS hinter Traefik

## Lokal starten

Voraussetzung: Node.js `>=22.13.0`.

Frontend (Vite-Dev-Server, proxied `/api` + `/admin` auf Port 4000):

```bash
npm ci
npm run dev
```

API-/Admin-Server (in einem zweiten Terminal). Für lokales Testen braucht ihr
eine eigene Auth0-Application (Tenant → Applications → "Regular Web
Application"), mit `http://localhost:4000/auth/callback` als Allowed
Callback URL und `http://localhost:4000/` als Allowed Logout URL:

```bash
DATA_DIR=./.data \
AUTH0_SECRET=$(openssl rand -hex 32) \
AUTH0_BASE_URL=http://localhost:4000 \
AUTH0_CLIENT_ID=... \
AUTH0_CLIENT_SECRET=... \
AUTH0_ISSUER_BASE_URL=https://DEIN-TENANT.eu.auth0.com \
npm run server
```

Ohne diese fünf `AUTH0_*`-Variablen antwortet der Server auf jede Route außer
`/healthz` mit `503` (bewusst fail-closed, wie vorher bei fehlender
Basic-Auth-Konfiguration).

Produktions-Build prüfen:

```bash
npm run build
```

Docker-Images lokal bauen und testen:

```bash
docker build -t ibiza-reise-cockpit -f Dockerfile .
docker build -t ibiza-reise-cockpit-api -f server/Dockerfile .
```

## Wichtige Dateien

- `app/page.tsx` – Oberfläche und Interaktionen; lädt die Reisedaten zur
  Laufzeit von `/api/trip`
- `app/globals.css` – vollständiges responsives Design
- `src/domain/trip.ts`, `src/domain/validate-trip.ts` – Datenmodell + Zod-Schema
- `src/domain/derive-trip.ts` – abgeleitete Werte (Countdown, Budget, Bereitschaft)
- `src/domain/open-meteo.ts`, `src/domain/weather-codes.ts` – Live-Wetter (Client-seitig, kein Backend nötig)
- `data/trip.example.json` – Beispieldaten, dienen als Seed für ein leeres Volume
- `server/` – kleiner Express-Server: `GET /api/trip`, `GET /admin` +
  `POST /admin/api/trip` (alle hinter Auth0-Login), `/auth/login`,
  `/auth/logout`, `/auth/callback`, `/auth/verify` (Session-Check für
  Traefiks `forwardAuth`, schützt das statische Frontend) und `/auth/me`
  (liefert E-Mail/Name der eingeloggten Person fürs Frontend)
- `AGENTS.md` – verbindlicher Projektkontext für Codex
- `HANDOVER.md` – Hintergrund zur Migration
- `Dockerfile`, `deploy/nginx.conf` – Frontend-Image (statischer Export über nginx)
- `server/Dockerfile` – API-/Admin-Image
- `deploy/docker-compose.yml` – Compose-Datei für den VPS: beide Services,
  Traefik-Labels, Daten-Volume
- `.github/workflows/deploy.yml` – Build, GHCR-Publish und SSH-Deploy bei
  jedem Push auf `main`

## Reisedaten bearbeiten

Unter `https://ibiza.srv1115517.hstgr.cloud/admin` (Auth0-Login) liegt ein
einfacher JSON-Editor: aktuelle Daten laden, anpassen, speichern. Der Server
validiert serverseitig gegen das Schema, schreibt atomar und legt vor jeder
Änderung ein Backup unter `/data/backups/` an (die letzten 20 bleiben
erhalten).

## Login (Auth0)

Das gesamte Dashboard — nicht nur `/admin` — ist hinter Auth0 verriegelt:
Traefik schickt jede Anfrage an die statische Frontend-Seite erst an
`GET /auth/verify` im API-Container (per `forwardAuth`-Middleware); ohne
gültige Session geht's zum Auth0-Login. `/api/*` und `/admin*` prüfen die
Session zusätzlich direkt in Express.

Accounts werden im Auth0-Tenant selbst angelegt (Dashboard → User
Management → Users → Create User), nicht im Code. Drei Punkte, die im
Auth0-Dashboard eingerichtet werden müssen:

1. Eine Application vom Typ "Regular Web Application".
2. Allowed Callback URLs: `https://ibiza.srv1115517.hstgr.cloud/auth/callback`
3. Allowed Logout URLs: `https://ibiza.srv1115517.hstgr.cloud/`

## Deployment

Der VPS-Deploy braucht folgende Secrets im GitHub-Environment `production`:

- `VPS_SSH_HOST`
- `VPS_SSH_USER`
- `VPS_SSH_PRIVATE_KEY`

Zusätzlich braucht der API-Container auf dem VPS eine nicht versionierte
Secret-Zero-Datei unter `/etc/ibiza-cockpit/admin.env`:

```
AUTH0_SECRET=...
AUTH0_BASE_URL=https://ibiza.srv1115517.hstgr.cloud
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_ISSUER_BASE_URL=https://DEIN-TENANT.eu.auth0.com
```

`AUTH0_SECRET` ist ein zufälliger String zur Cookie-Verschlüsselung, z. B.
per `openssl rand -hex 32` erzeugt — kein Auth0-Wert, sondern lokal generiert.
`AUTH0_CLIENT_ID`/`AUTH0_CLIENT_SECRET`/`AUTH0_ISSUER_BASE_URL` kommen aus
den Application-Einstellungen im Auth0-Dashboard. Ohne diese Datei antwortet
jede Route außer `/healthz` mit `503` (bewusst fail-closed).

Diese Datei liegt außerhalb des Git-Repos direkt auf dem VPS und wird vom
Deploy-Workflow nicht verwaltet — Änderungen daran erfordern manuell
`docker compose up -d` im Projektverzeichnis auf dem VPS, damit der
API-Container sie neu einliest.

Details stehen in [HANDOVER.md](HANDOVER.md).
