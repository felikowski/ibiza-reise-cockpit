import express, { type NextFunction, type Request, type Response } from "express";
import { adminPageHtml } from "./admin-page";
import { PlacesApiError, resolveGoogleMapsLink } from "./places-client";
import {
  addItineraryDay,
  addPackingItem,
  addPlace,
  addShoppingItem,
  addTimelineEntry,
  ensureSeeded,
  ItemNotFoundError,
  PLACE_PHOTOS_DIR,
  PLACE_PHOTOS_PUBLIC_PATH,
  readTrip,
  removeItineraryDay,
  removePackingItem,
  removePlace,
  removeShoppingItem,
  removeTimelineEntry,
  TripValidationError,
  updateItineraryDay,
  updatePackingItem,
  updatePlace,
  updateShoppingItem,
  updateTimelineEntry,
  writeTrip,
} from "./trip-store";

const PORT = Number(process.env.PORT ?? 4000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DAY_TONES = ["sun", "water", "peach", "sage", "stone"] as const;

// Resolving a Maps link triggers a billed Google Places API call, and this
// endpoint has no auth (same as the rest of the public Entdecken editing) —
// so it gets its own tight per-IP cap to bound worst-case cost, separate
// from the free-to-serve CRUD endpoints above.
const RESOLVE_LINK_LIMIT_PER_HOUR = 30;
const RESOLVE_LINK_WINDOW_MS = 60 * 60 * 1000;
const resolveLinkHits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (resolveLinkHits.get(key) ?? []).filter((timestamp) => now - timestamp < RESOLVE_LINK_WINDOW_MS);
  hits.push(now);
  resolveLinkHits.set(key, hits);
  return hits.length > RESOLVE_LINK_LIMIT_PER_HOUR;
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    res.status(503).send("Admin-Zugang ist nicht konfiguriert (ADMIN_USERNAME/ADMIN_PASSWORD fehlen).");
    return;
  }

  const header = req.headers.authorization;
  const [scheme, encoded] = header?.split(" ") ?? [];
  const decoded = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  const separatorIndex = decoded.indexOf(":");
  const user = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const pass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
    next();
    return;
  }

  res.set("WWW-Authenticate", 'Basic realm="Ibiza Reise-Cockpit Admin"');
  res.status(401).send("Authentifizierung erforderlich.");
}

async function main() {
  await ensureSeeded();

  const app = express();
  app.disable("x-powered-by");
  // Behind Traefik: trust its X-Forwarded-For so req.ip reflects the real
  // visitor, which the resolve-link rate limiter below keys on.
  app.set("trust proxy", true);

  app.get("/healthz", (_req, res) => res.type("text").send("ok"));

  app.use(PLACE_PHOTOS_PUBLIC_PATH, express.static(PLACE_PHOTOS_DIR));

  app.get("/api/trip", async (_req, res) => {
    try {
      const trip = await readTrip();
      res.json(trip);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  const packingJson = express.json({ limit: "100kb" });
  const shoppingJson = express.json({ limit: "100kb" });

  app.post("/api/packing/items", packingJson, async (req, res) => {
    try {
      const { groupTitle, label, scope, assignedTo } = req.body ?? {};
      if (
        typeof groupTitle !== "string" ||
        typeof label !== "string" ||
        (scope !== "personal" && scope !== "shared")
      ) {
        res.status(400).json({ error: "groupTitle, label und scope (personal|shared) sind erforderlich." });
        return;
      }
      const trip = await addPackingItem(groupTitle, label, scope, typeof assignedTo === "string" ? assignedTo : null);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.patch("/api/packing/items/:id", packingJson, async (req, res) => {
    try {
      const { checked, assignedTo } = req.body ?? {};
      const patch: { checked?: boolean; assignedTo?: string | null } = {};
      if (checked !== undefined) {
        if (typeof checked !== "boolean") {
          res.status(400).json({ error: "checked muss ein boolean sein." });
          return;
        }
        patch.checked = checked;
      }
      if (assignedTo !== undefined) {
        if (assignedTo !== null && typeof assignedTo !== "string") {
          res.status(400).json({ error: "assignedTo muss ein string oder null sein." });
          return;
        }
        patch.assignedTo = assignedTo;
      }
      const trip = await updatePackingItem(req.params.id, patch);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.delete("/api/packing/items/:id", async (req, res) => {
    try {
      const trip = await removePackingItem(req.params.id);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.post("/api/shopping/items", shoppingJson, async (req, res) => {
    try {
      const { categoryTitle, label } = req.body ?? {};
      if (typeof categoryTitle !== "string" || typeof label !== "string") {
        res.status(400).json({ error: "categoryTitle und label sind erforderlich." });
        return;
      }
      const trip = await addShoppingItem(categoryTitle, label);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.patch("/api/shopping/items/:id", shoppingJson, async (req, res) => {
    try {
      const { checked } = req.body ?? {};
      if (typeof checked !== "boolean") {
        res.status(400).json({ error: "checked muss ein boolean sein." });
        return;
      }
      const trip = await updateShoppingItem(req.params.id, { checked });
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.delete("/api/shopping/items/:id", async (req, res) => {
    try {
      const trip = await removeShoppingItem(req.params.id);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  const itineraryJson = express.json({ limit: "100kb" });

  app.post("/api/itinerary/days", itineraryJson, async (req, res) => {
    try {
      const { weekday, dateLabel, title, note, tone } = req.body ?? {};
      if (
        typeof weekday !== "string" ||
        typeof dateLabel !== "string" ||
        typeof title !== "string" ||
        typeof note !== "string" ||
        !DAY_TONES.includes(tone)
      ) {
        res.status(400).json({ error: "weekday, dateLabel, title, note und tone sind erforderlich." });
        return;
      }
      const trip = await addItineraryDay({ weekday, dateLabel, title, note, tone });
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.patch("/api/itinerary/days/:id", itineraryJson, async (req, res) => {
    try {
      const { weekday, dateLabel, title, note, tone } = req.body ?? {};
      const patch: Partial<{ weekday: string; dateLabel: string; title: string; note: string; tone: (typeof DAY_TONES)[number] }> = {};
      if (weekday !== undefined) {
        if (typeof weekday !== "string") { res.status(400).json({ error: "weekday muss ein string sein." }); return; }
        patch.weekday = weekday;
      }
      if (dateLabel !== undefined) {
        if (typeof dateLabel !== "string") { res.status(400).json({ error: "dateLabel muss ein string sein." }); return; }
        patch.dateLabel = dateLabel;
      }
      if (title !== undefined) {
        if (typeof title !== "string") { res.status(400).json({ error: "title muss ein string sein." }); return; }
        patch.title = title;
      }
      if (note !== undefined) {
        if (typeof note !== "string") { res.status(400).json({ error: "note muss ein string sein." }); return; }
        patch.note = note;
      }
      if (tone !== undefined) {
        if (!DAY_TONES.includes(tone)) { res.status(400).json({ error: "tone ist ungültig." }); return; }
        patch.tone = tone;
      }
      const trip = await updateItineraryDay(req.params.id, patch);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.delete("/api/itinerary/days/:id", async (req, res) => {
    try {
      const trip = await removeItineraryDay(req.params.id);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.post("/api/itinerary/days/:id/timeline", itineraryJson, async (req, res) => {
    try {
      const { time, title, note, highlight } = req.body ?? {};
      if (typeof time !== "string" || typeof title !== "string" || typeof note !== "string" || typeof highlight !== "boolean") {
        res.status(400).json({ error: "time, title, note und highlight sind erforderlich." });
        return;
      }
      const trip = await addTimelineEntry(req.params.id, { time, title, note, highlight });
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.patch("/api/itinerary/timeline/:id", itineraryJson, async (req, res) => {
    try {
      const { time, title, note, highlight } = req.body ?? {};
      const patch: Partial<{ time: string; title: string; note: string; highlight: boolean }> = {};
      if (time !== undefined) {
        if (typeof time !== "string") { res.status(400).json({ error: "time muss ein string sein." }); return; }
        patch.time = time;
      }
      if (title !== undefined) {
        if (typeof title !== "string") { res.status(400).json({ error: "title muss ein string sein." }); return; }
        patch.title = title;
      }
      if (note !== undefined) {
        if (typeof note !== "string") { res.status(400).json({ error: "note muss ein string sein." }); return; }
        patch.note = note;
      }
      if (highlight !== undefined) {
        if (typeof highlight !== "boolean") { res.status(400).json({ error: "highlight muss ein boolean sein." }); return; }
        patch.highlight = highlight;
      }
      const trip = await updateTimelineEntry(req.params.id, patch);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.delete("/api/itinerary/timeline/:id", async (req, res) => {
    try {
      const trip = await removeTimelineEntry(req.params.id);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  const placesJson = express.json({ limit: "100kb" });

  app.post("/api/places", placesJson, async (req, res) => {
    try {
      const { name, type, area, note, color, lat, lon, image } = req.body ?? {};
      if (
        typeof name !== "string" ||
        typeof type !== "string" ||
        typeof area !== "string" ||
        typeof note !== "string" ||
        typeof color !== "string" ||
        (lat !== undefined && lat !== null && typeof lat !== "number") ||
        (lon !== undefined && lon !== null && typeof lon !== "number") ||
        (image !== undefined && image !== null && typeof image !== "string")
      ) {
        res.status(400).json({ error: "name, type, area, note und color sind erforderlich; lat, lon und image sind optional." });
        return;
      }
      const trip = await addPlace({ name, type, area, note, color, lat: lat ?? null, lon: lon ?? null, image: image ?? null });
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.patch("/api/places/:id", placesJson, async (req, res) => {
    try {
      const { name, type, area, note, color, lat, lon, image } = req.body ?? {};
      const patch: Partial<{
        name: string;
        type: string;
        area: string;
        note: string;
        color: string;
        lat: number | null;
        lon: number | null;
        image: string | null;
      }> = {};
      if (name !== undefined) {
        if (typeof name !== "string") { res.status(400).json({ error: "name muss ein string sein." }); return; }
        patch.name = name;
      }
      if (type !== undefined) {
        if (typeof type !== "string") { res.status(400).json({ error: "type muss ein string sein." }); return; }
        patch.type = type;
      }
      if (area !== undefined) {
        if (typeof area !== "string") { res.status(400).json({ error: "area muss ein string sein." }); return; }
        patch.area = area;
      }
      if (note !== undefined) {
        if (typeof note !== "string") { res.status(400).json({ error: "note muss ein string sein." }); return; }
        patch.note = note;
      }
      if (color !== undefined) {
        if (typeof color !== "string") { res.status(400).json({ error: "color muss ein string sein." }); return; }
        patch.color = color;
      }
      if (lat !== undefined) {
        if (lat !== null && typeof lat !== "number") { res.status(400).json({ error: "lat muss eine Zahl oder null sein." }); return; }
        patch.lat = lat;
      }
      if (lon !== undefined) {
        if (lon !== null && typeof lon !== "number") { res.status(400).json({ error: "lon muss eine Zahl oder null sein." }); return; }
        patch.lon = lon;
      }
      if (image !== undefined) {
        if (image !== null && typeof image !== "string") { res.status(400).json({ error: "image muss ein string oder null sein." }); return; }
        patch.image = image;
      }
      const trip = await updatePlace(req.params.id, patch);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.delete("/api/places/:id", async (req, res) => {
    try {
      const trip = await removePlace(req.params.id);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof ItemNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.post("/api/places/resolve-link", express.json({ limit: "10kb" }), async (req, res) => {
    try {
      const { url } = req.body ?? {};
      if (typeof url !== "string" || url.trim().length < 1) {
        res.status(400).json({ error: "url ist erforderlich." });
        return;
      }
      if (isRateLimited(req.ip ?? "unknown")) {
        res.status(429).json({ error: "Zu viele Anfragen. Bitte kurz warten und erneut versuchen." });
        return;
      }
      const suggestion = await resolveGoogleMapsLink(url.trim(), PLACE_PHOTOS_DIR, PLACE_PHOTOS_PUBLIC_PATH);
      res.json({ ok: true, suggestion });
    } catch (error) {
      if (error instanceof PlacesApiError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.get("/admin", requireAdminAuth, (_req, res) => {
    res.type("html").send(adminPageHtml);
  });

  app.post("/admin/api/trip", requireAdminAuth, express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const trip = await writeTrip(req.body);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof TripValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  app.listen(PORT, () => {
    console.log(`ibiza-cockpit api listening on :${PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
