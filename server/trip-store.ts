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
const MAX_PACKING_ITEMS = 300;
const MAX_LABEL_LENGTH = 120;

const DEFAULT_PACKING_PEOPLE = [
  { id: "felix", name: "Felix" },
  { id: "filter", name: "Filter" },
  { id: "lordBuckethelm", name: "Lord Buckethelm" },
];

export class TripValidationError extends Error {}
export class PackingNotFoundError extends Error {}

/** Upgrades the pre-per-person packing shape (string items + a flat
 * `defaultPacked` list, no `people`) to the current one, so existing
 * `trip.json` files (local or on the VPS) keep working without a manual
 * migration step. No-op once a file is already in the current shape. */
function migrateLegacyPacking(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !("packing" in raw)) return raw;
  const record = raw as Record<string, unknown>;
  const packing = record.packing;
  if (typeof packing !== "object" || packing === null) return raw;
  const packingRecord = packing as Record<string, unknown>;
  const groups = packingRecord.groups;
  if (!Array.isArray(groups)) return raw;

  const isLegacy = groups.some(
    (group) =>
      typeof group === "object" &&
      group !== null &&
      Array.isArray((group as Record<string, unknown>).items) &&
      (group as Record<string, unknown[]>).items.some((item) => typeof item === "string"),
  );
  if (!isLegacy) return raw;

  const defaultPacked = new Set(Array.isArray(packingRecord.defaultPacked) ? (packingRecord.defaultPacked as unknown[]) : []);

  return {
    ...record,
    packing: {
      people: Array.isArray(packingRecord.people) && packingRecord.people.length > 0 ? packingRecord.people : DEFAULT_PACKING_PEOPLE,
      groups: groups.map((group) => {
        const groupRecord = group as Record<string, unknown>;
        const items = Array.isArray(groupRecord.items) ? groupRecord.items : [];
        return {
          title: groupRecord.title,
          items: items.map((item) =>
            typeof item === "string"
              ? { id: randomUUID(), label: item, assignedTo: null, checked: defaultPacked.has(item) }
              : item,
          ),
        };
      }),
    },
  };
}

export async function ensureSeeded(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(TRIP_FILE)) {
    await copyFile(SEED_FILE, TRIP_FILE);
  }
}

export async function readTrip(): Promise<Trip> {
  const raw = await readFile(TRIP_FILE, "utf8");
  const result = validateTrip(migrateLegacyPacking(JSON.parse(raw)));
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

function totalPackingItems(trip: Trip): number {
  return trip.packing.groups.reduce((sum, group) => sum + group.items.length, 0);
}

function assertValidAssignee(trip: Trip, assignedTo: string | null): void {
  if (assignedTo === null) return;
  if (!trip.packing.people.some((person) => person.id === assignedTo)) {
    throw new TripValidationError(`Unbekannte Person: ${assignedTo}`);
  }
}

export async function addPackingItem(groupTitle: string, label: string, assignedTo: string | null): Promise<Trip> {
  const trimmed = label.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_LABEL_LENGTH) {
    throw new TripValidationError(`Bezeichnung muss 1-${MAX_LABEL_LENGTH} Zeichen lang sein.`);
  }

  const trip = await readTrip();
  assertValidAssignee(trip, assignedTo);
  if (totalPackingItems(trip) >= MAX_PACKING_ITEMS) {
    throw new TripValidationError(`Die Packliste hat das Limit von ${MAX_PACKING_ITEMS} Punkten erreicht.`);
  }

  const group = trip.packing.groups.find((candidate) => candidate.title === groupTitle);
  if (!group) {
    throw new PackingNotFoundError(`Gruppe nicht gefunden: ${groupTitle}`);
  }

  group.items.push({ id: randomUUID(), label: trimmed, assignedTo, checked: false });
  return writeTrip(trip);
}

export async function removePackingItem(itemId: string): Promise<Trip> {
  const trip = await readTrip();
  let found = false;
  for (const group of trip.packing.groups) {
    const index = group.items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      group.items.splice(index, 1);
      found = true;
      break;
    }
  }
  if (!found) {
    throw new PackingNotFoundError(`Packlisten-Punkt nicht gefunden: ${itemId}`);
  }
  return writeTrip(trip);
}

export async function updatePackingItem(
  itemId: string,
  patch: { checked?: boolean; assignedTo?: string | null },
): Promise<Trip> {
  const trip = await readTrip();
  if (patch.assignedTo !== undefined) {
    assertValidAssignee(trip, patch.assignedTo);
  }

  let item: Trip["packing"]["groups"][number]["items"][number] | undefined;
  for (const group of trip.packing.groups) {
    item = group.items.find((candidate) => candidate.id === itemId);
    if (item) break;
  }
  if (!item) {
    throw new PackingNotFoundError(`Packlisten-Punkt nicht gefunden: ${itemId}`);
  }

  if (patch.checked !== undefined) item.checked = patch.checked;
  if (patch.assignedTo !== undefined) item.assignedTo = patch.assignedTo;

  return writeTrip(trip);
}
