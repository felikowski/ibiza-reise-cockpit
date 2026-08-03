# Ibiza Reise-Cockpit

Interaktives Dashboard für eine Ibiza-Reise mit Reiseplan, Buchungen,
Entdeckungen, Budget, Packliste sowie Dokumenten und Notfallinformationen.

Aktuelle öffentliche Demo:
[ibiza-reise-cockpit-fg.felikowski.chatgpt.site](https://ibiza-reise-cockpit-fg.felikowski.chatgpt.site)

> Die Demo enthält ausschließlich frei erfundene Beispieldaten.

## Aktueller Stand

- responsive Einseiter-App mit sieben Bereichen
- auswählbarer Tagesplan
- filterbare Orte
- kopierbare Buchungsnummern
- interaktive Packliste (derzeit nur im Arbeitsspeicher)
- veröffentlicht über OpenAI Sites
- keine Datenbank und keine externen APIs

Die Reisedaten sind momentan als Beispielwerte in `app/page.tsx` hinterlegt.
Der geplante nächste Schritt ist die Auslagerung in eine zentrale JSON-Datei
und anschließend ein portables Docker-Deployment für einen eigenen VPS.

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

## Wichtige Dateien

- `app/page.tsx` – Oberfläche, Beispielinhalte und Interaktionen
- `app/globals.css` – vollständiges responsives Design
- `app/layout.tsx` – Seitentitel und Metadaten
- `AGENTS.md` – verbindlicher Projektkontext für Codex
- `HANDOVER.md` – Migrationsplan für JSON, Docker und VPS
- `.openai/hosting.json` – bestehende Sites-Veröffentlichung

## Zielbild

1. Reisedaten aus der Oberfläche in eine validierte `trip.json` verschieben.
2. Laufzeitunabhängige Bereitstellung als statische Web-App vorbereiten.
3. Docker-Image automatisiert über GitHub Actions bauen.
4. Image auf dem VPS hinter Caddy oder Nginx betreiben.
5. Vor echten persönlichen Daten einen Zugangsschutz aktivieren.

Bis der VPS vollständig getestet ist, bleibt die bestehende Sites-Version die
Referenz. Details und Abnahmekriterien stehen in [HANDOVER.md](HANDOVER.md).
