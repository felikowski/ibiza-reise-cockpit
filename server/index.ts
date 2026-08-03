import express, { type NextFunction, type Request, type Response } from "express";
import { adminPageHtml } from "./admin-page";
import { ensureSeeded, readTrip, TripValidationError, writeTrip } from "./trip-store";

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
