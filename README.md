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
  eine Basic-Auth-geschützte Oberfläche editierbar macht
- automatisches Deployment: jeder Push auf `main` baut beide Images,
  published sie nach GHCR und deployed sie per SSH auf den VPS hinter Traefik

## Lokal starten

Voraussetzung: Node.js `>=22.13.0`.

Frontend (Vite-Dev-Server, proxied `/api` + `/admin` auf Port 4000):

```bash
npm ci
npm run dev
```

API-/Admin-Server (in einem zweiten Terminal):

```bash
DATA_DIR=./.data ADMIN_USERNAME=admin ADMIN_PASSWORD=changeme npm run server
```

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
- `server/` – kleiner Express-Server: `GET /api/trip` (öffentlich),
  `GET /admin` + `POST /admin/api/trip` (Basic-Auth-geschützt)
- `AGENTS.md` – verbindlicher Projektkontext für Codex
- `HANDOVER.md` – Hintergrund zur Migration
- `Dockerfile`, `deploy/nginx.conf` – Frontend-Image (statischer Export über nginx)
- `server/Dockerfile` – API-/Admin-Image
- `deploy/docker-compose.yml` – Compose-Datei für den VPS: beide Services,
  Traefik-Labels, Daten-Volume
- `.github/workflows/deploy.yml` – Build, GHCR-Publish und SSH-Deploy bei
  jedem Push auf `main`

## Reisedaten bearbeiten

Unter `https://ibiza.srv1115517.hstgr.cloud/admin` (Basic Auth) liegt ein
einfacher JSON-Editor: aktuelle Daten laden, anpassen, speichern. Der Server
validiert serverseitig gegen das Schema, schreibt atomar und legt vor jeder
Änderung ein Backup unter `/data/backups/` an (die letzten 20 bleiben
erhalten).

## Deployment

Der VPS-Deploy braucht folgende Secrets im GitHub-Environment `production`:

- `VPS_SSH_HOST`
- `VPS_SSH_USER`
- `VPS_SSH_PRIVATE_KEY`

Zusätzlich braucht der API-Container auf dem VPS eine nicht versionierte
Secret-Zero-Datei unter `/etc/ibiza-cockpit/admin.env`:

```
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
```

Ohne diese Datei antwortet `/admin` mit `503` (bewusst fail-closed).

Details stehen in [HANDOVER.md](HANDOVER.md).
