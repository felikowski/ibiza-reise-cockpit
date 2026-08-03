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
- interaktive Packliste (derzeit nur im Arbeitsspeicher)
- statischer Export (`output: "export"`), als Docker-Image via nginx
  ausgeliefert; kein Backend, keine Datenbank, keine externen APIs
- automatisches Deployment: jeder Push auf `main` baut das Image, published
  es nach GHCR und deployed es per SSH auf den VPS hinter Traefik

Die Reisedaten sind momentan als Beispielwerte in `app/page.tsx` hinterlegt.
Der geplante nächste Schritt ist die Auslagerung in eine zentrale JSON-Datei
(siehe [HANDOVER.md](HANDOVER.md)).

## Lokal starten

Voraussetzung: Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Produktions-Build prüfen:

```bash
npm run build
```

Docker-Image lokal bauen und testen:

```bash
docker build -t ibiza-reise-cockpit .
docker run --rm -p 8080:80 ibiza-reise-cockpit
```

## Wichtige Dateien

- `app/page.tsx` – Oberfläche, Beispielinhalte und Interaktionen
- `app/globals.css` – vollständiges responsives Design
- `app/layout.tsx` – Seitentitel und Metadaten
- `AGENTS.md` – verbindlicher Projektkontext für Codex
- `HANDOVER.md` – Migrationsplan für das JSON-Datenmodell
- `Dockerfile`, `deploy/nginx.conf` – Produktions-Image (statischer Export
  über nginx)
- `deploy/docker-compose.yml` – Compose-Datei für den VPS, inkl.
  Traefik-Labels
- `.github/workflows/deploy.yml` – Build, GHCR-Publish und SSH-Deploy bei
  jedem Push auf `main`

## Deployment

Der VPS-Deploy braucht folgende Secrets im GitHub-Environment `production`:

- `VPS_SSH_HOST`
- `VPS_SSH_USER`
- `VPS_SSH_PRIVATE_KEY`

Details und der offene nächste Schritt (JSON-Datenmodell) stehen in
[HANDOVER.md](HANDOVER.md).
