import express, { type NextFunction, type Request, type Response } from "express";
import { adminPageHtml } from "./admin-page";
import {
  addPackingItem,
  ensureSeeded,
  PackingNotFoundError,
  readTrip,
  removePackingItem,
  TripValidationError,
  updatePackingItem,
  writeTrip,
} from "./trip-store";

const PORT = Number(process.env.PORT ?? 4000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

  app.get("/healthz", (_req, res) => res.type("text").send("ok"));

  app.get("/api/trip", async (_req, res) => {
    try {
      const trip = await readTrip();
      res.json(trip);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" });
    }
  });

  const packingJson = express.json({ limit: "100kb" });

  app.post("/api/packing/items", packingJson, async (req, res) => {
    try {
      const { groupTitle, label, assignedTo } = req.body ?? {};
      if (typeof groupTitle !== "string" || typeof label !== "string") {
        res.status(400).json({ error: "groupTitle und label sind erforderlich." });
        return;
      }
      const trip = await addPackingItem(groupTitle, label, typeof assignedTo === "string" ? assignedTo : null);
      res.json({ ok: true, trip });
    } catch (error) {
      if (error instanceof PackingNotFoundError) {
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
      if (error instanceof PackingNotFoundError) {
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
      if (error instanceof PackingNotFoundError) {
        res.status(404).json({ error: error.message });
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
