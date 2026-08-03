import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Trip } from "../src/domain/trip";
import { validateTrip } from "../src/domain/validate-trip";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const SEED_FILE = process.env.SEED_FILE ?? path.join(process.cwd(), "data", "trip.example.json");
const TRIP_FILE = path.join(DATA_DIR, "trip.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BACKUPS = 20;

export class TripValidationError extends Error {}

export async function ensureSeeded(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(TRIP_FILE)) {
    await copyFile(SEED_FILE, TRIP_FILE);
  }
}

export async function readTrip(): Promise<Trip> {
  const raw = await readFile(TRIP_FILE, "utf8");
  const result = validateTrip(JSON.parse(raw));
  if (!result.success) {
    throw new TripValidationError(result.error);
  }
  return result.data;
}

async function pruneBackups(): Promise<void> {
  const files = (await readdir(BACKUP_DIR)).filter((name) => name.endsWith(".json")).sort();
  const excess = files.length - MAX_BACKUPS;
  if (excess <= 0) return;
  await Promise.all(files.slice(0, excess).map((name) => rm(path.join(BACKUP_DIR, name))));
}

export async function writeTrip(input: unknown): Promise<Trip> {
  const result = validateTrip(input);
  if (!result.success) {
    throw new TripValidationError(result.error);
  }

  await mkdir(BACKUP_DIR, { recursive: true });
  if (existsSync(TRIP_FILE)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await copyFile(TRIP_FILE, path.join(BACKUP_DIR, `trip-${timestamp}.json`));
    await pruneBackups();
  }

  const tmpFile = path.join(DATA_DIR, `.trip-${randomUUID()}.json.tmp`);
  await writeFile(tmpFile, JSON.stringify(result.data, null, 2), "utf8");
  await rename(tmpFile, TRIP_FILE);

  return result.data;
}
