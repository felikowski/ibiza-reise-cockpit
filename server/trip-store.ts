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
const MAX_SHOPPING_ITEMS = 300;
const MAX_LABEL_LENGTH = 120;
const MAX_ITINERARY_DAYS = 30;
const MAX_TIMELINE_ENTRIES_PER_DAY = 40;
const MAX_PLACES = 200;

export const PLACE_PHOTOS_DIR = path.join(DATA_DIR, "place-photos");
export const PLACE_PHOTOS_PUBLIC_PATH = "/api/place-photos";

const DEFAULT_PACKING_PEOPLE = [
  { id: "felix", name: "Felix" },
  { id: "filter", name: "Filter" },
  { id: "lordBuckethelm", name: "Lord Buckethelm" },
];

/** Seeded from a shared kaufDA shopping list, grouped to match the aisle
 * layout of a typical Mercadona (the supermarket chain nearest the finca). */
const DEFAULT_SHOPPING_CATEGORIES: { title: string; items: string[] }[] = [
  { title: "Obst & Gemüse", items: ["Wassermelone", "Knoblauch", "Zwiebeln"] },
  { title: "Brot & Backwaren", items: ["Brot", "Aufbackbrötchen"] },
  { title: "Wurst, Käse & Feinkost", items: ["Oliven", "Wurst", "Würstchen"] },
  { title: "Milchprodukte & Eier", items: ["Butter", "Milch", "Eier", "Käse", "Parmesan"] },
  { title: "Tiefkühlkost", items: ["Burger"] },
  { title: "Konserven, Nudeln & Gewürze", items: ["Passierte Tomaten", "Nudeln", "Zucker", "Tomatensoße"] },
  { title: "Süßes & Snacks", items: ["Chips"] },
  { title: "Getränke", items: ["Wasser", "Orangensaft", "Cola", "Rum", "Wodka", "Bier"] },
  { title: "Kaffee & Tee", items: ["Kaffee"] },
  { title: "Sonstiges", items: ["Einweggrill"] },
];

export class TripValidationError extends Error {}
export class ItemNotFoundError extends Error {}

/** Upgrades older packing shapes to the current one, so existing `trip.json`
 * files (local or on the VPS) keep working without a manual migration step:
 * - pre-per-person shape (string items + a flat `defaultPacked` list, no `people`)
 * - pre-`scope` shape (items with `assignedTo` but no `scope` field)
 * Items that already had a person in `assignedTo` become `scope: "personal"`
 * so they stay in that person's own tab; only unassigned items become
 * `scope: "shared"` (visible in the "Gesamt" tab). No-op once a file is
 * already in the current shape. */
function migrateLegacyPacking(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !("packing" in raw)) return raw;
  const record = raw as Record<string, unknown>;
  const packing = record.packing;
  if (typeof packing !== "object" || packing === null) return raw;
  const packingRecord = packing as Record<string, unknown>;
  const groups = packingRecord.groups;
  if (!Array.isArray(groups)) return raw;

  const hasStringItems = groups.some(
    (group) =>
      typeof group === "object" &&
      group !== null &&
      Array.isArray((group as Record<string, unknown>).items) &&
      (group as Record<string, unknown[]>).items.some((item) => typeof item === "string"),
  );
  const hasItemsWithoutScope = groups.some(
    (group) =>
      typeof group === "object" &&
      group !== null &&
      Array.isArray((group as Record<string, unknown>).items) &&
      (group as Record<string, unknown[]>).items.some(
        (item) => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).scope !== "string",
      ),
  );
  const needsPeopleDefault = !Array.isArray(packingRecord.people) || packingRecord.people.length === 0;

  if (!hasStringItems && !hasItemsWithoutScope && !needsPeopleDefault) return raw;

  const defaultPacked = new Set(Array.isArray(packingRecord.defaultPacked) ? (packingRecord.defaultPacked as unknown[]) : []);

  return {
    ...record,
    packing: {
      people: needsPeopleDefault ? DEFAULT_PACKING_PEOPLE : packingRecord.people,
      groups: groups.map((group) => {
        const groupRecord = group as Record<string, unknown>;
        const items = Array.isArray(groupRecord.items) ? groupRecord.items : [];
        return {
          title: groupRecord.title,
          items: items.map((item) => {
            if (typeof item === "string") {
              return { id: randomUUID(), label: item, assignedTo: null, scope: "shared", checked: defaultPacked.has(item) };
            }
            const itemRecord = item as Record<string, unknown>;
            if (typeof itemRecord.scope === "string") return itemRecord;
            return { ...itemRecord, scope: itemRecord.assignedTo ? "personal" : "shared" };
          }),
        };
      }),
    },
  };
}

/** Adds a default `shopping` section (seeded from a shared kaufDA list) to
 * older `trip.json` files that predate the shopping-list feature, so they
 * keep working without a manual migration step. No-op once a file already
 * has a `shopping` field. */
function migrateLegacyShopping(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const record = raw as Record<string, unknown>;
  if (typeof record.shopping === "object" && record.shopping !== null) return raw;

  return {
    ...record,
    shopping: {
      categories: DEFAULT_SHOPPING_CATEGORIES.map((category) => ({
        title: category.title,
        items: category.items.map((label) => ({ id: randomUUID(), label, checked: false })),
      })),
    },
  };
}

/** Adds `id` fields to itinerary days and their timeline entries for older
 * `trip.json` files that predate per-item editing (added alongside the
 * itinerary CRUD API), so they keep working without a manual migration
 * step. No-op once every day and entry already has an id. */
function migrateLegacyItinerary(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !("itineraryDays" in raw)) return raw;
  const record = raw as Record<string, unknown>;
  const days = record.itineraryDays;
  if (!Array.isArray(days)) return raw;

  const needsMigration = days.some((day) => {
    if (typeof day !== "object" || day === null) return false;
    const dayRecord = day as Record<string, unknown>;
    if (typeof dayRecord.id !== "string") return true;
    const timeline = dayRecord.timeline;
    return Array.isArray(timeline) && timeline.some((entry) => typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).id !== "string");
  });
  if (!needsMigration) return raw;

  return {
    ...record,
    itineraryDays: days.map((day) => {
      const dayRecord = day as Record<string, unknown>;
      const timeline = Array.isArray(dayRecord.timeline) ? dayRecord.timeline : [];
      return {
        ...dayRecord,
        id: typeof dayRecord.id === "string" ? dayRecord.id : randomUUID(),
        timeline: timeline.map((entry) => {
          const entryRecord = entry as Record<string, unknown>;
          return { ...entryRecord, id: typeof entryRecord.id === "string" ? entryRecord.id : randomUUID() };
        }),
      };
    }),
  };
}

/** Adds `id` fields to places for older `trip.json` files that predate
 * per-item editing (added alongside the places CRUD API), so they keep
 * working without a manual migration step. No-op once every place already
 * has an id. */
function migrateLegacyPlaces(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !("places" in raw)) return raw;
  const record = raw as Record<string, unknown>;
  const places = record.places;
  if (!Array.isArray(places)) return raw;

  const needsMigration = places.some(
    (place) => typeof place !== "object" || place === null || typeof (place as Record<string, unknown>).id !== "string",
  );
  if (!needsMigration) return raw;

  return {
    ...record,
    places: places.map((place) => {
      const placeRecord = place as Record<string, unknown>;
      return { ...placeRecord, id: typeof placeRecord.id === "string" ? placeRecord.id : randomUUID() };
    }),
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
  const result = validateTrip(migrateLegacyPlaces(migrateLegacyItinerary(migrateLegacyShopping(migrateLegacyPacking(JSON.parse(raw))))));
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

export async function addPackingItem(
  groupTitle: string,
  label: string,
  scope: "personal" | "shared",
  assignedTo: string | null,
): Promise<Trip> {
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
    throw new ItemNotFoundError(`Gruppe nicht gefunden: ${groupTitle}`);
  }

  group.items.push({ id: randomUUID(), label: trimmed, assignedTo, scope, checked: false });
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
    throw new ItemNotFoundError(`Packlisten-Punkt nicht gefunden: ${itemId}`);
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
    throw new ItemNotFoundError(`Packlisten-Punkt nicht gefunden: ${itemId}`);
  }

  if (patch.checked !== undefined) item.checked = patch.checked;
  if (patch.assignedTo !== undefined) item.assignedTo = patch.assignedTo;

  return writeTrip(trip);
}

function totalShoppingItems(trip: Trip): number {
  return trip.shopping.categories.reduce((sum, category) => sum + category.items.length, 0);
}

export async function addShoppingItem(categoryTitle: string, label: string): Promise<Trip> {
  const trimmed = label.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_LABEL_LENGTH) {
    throw new TripValidationError(`Bezeichnung muss 1-${MAX_LABEL_LENGTH} Zeichen lang sein.`);
  }

  const trip = await readTrip();
  if (totalShoppingItems(trip) >= MAX_SHOPPING_ITEMS) {
    throw new TripValidationError(`Die Einkaufsliste hat das Limit von ${MAX_SHOPPING_ITEMS} Punkten erreicht.`);
  }

  const category = trip.shopping.categories.find((candidate) => candidate.title === categoryTitle);
  if (!category) {
    throw new ItemNotFoundError(`Kategorie nicht gefunden: ${categoryTitle}`);
  }

  category.items.push({ id: randomUUID(), label: trimmed, checked: false });
  return writeTrip(trip);
}

export async function removeShoppingItem(itemId: string): Promise<Trip> {
  const trip = await readTrip();
  let found = false;
  for (const category of trip.shopping.categories) {
    const index = category.items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      category.items.splice(index, 1);
      found = true;
      break;
    }
  }
  if (!found) {
    throw new ItemNotFoundError(`Einkaufslisten-Punkt nicht gefunden: ${itemId}`);
  }
  return writeTrip(trip);
}

export async function updateShoppingItem(itemId: string, patch: { checked: boolean }): Promise<Trip> {
  const trip = await readTrip();

  let item: Trip["shopping"]["categories"][number]["items"][number] | undefined;
  for (const category of trip.shopping.categories) {
    item = category.items.find((candidate) => candidate.id === itemId);
    if (item) break;
  }
  if (!item) {
    throw new ItemNotFoundError(`Einkaufslisten-Punkt nicht gefunden: ${itemId}`);
  }

  item.checked = patch.checked;
  return writeTrip(trip);
}

export interface ItineraryDayFields {
  weekday: string;
  dateLabel: string;
  title: string;
  note: string;
  tone: Trip["itineraryDays"][number]["tone"];
}

function assertItineraryDayFields(fields: Partial<ItineraryDayFields>): void {
  if (fields.weekday !== undefined && fields.weekday.trim().length < 1) {
    throw new TripValidationError("Wochentag darf nicht leer sein.");
  }
  if (fields.dateLabel !== undefined && fields.dateLabel.trim().length < 1) {
    throw new TripValidationError("Datum-Label darf nicht leer sein.");
  }
  if (fields.title !== undefined && fields.title.trim().length < 1) {
    throw new TripValidationError("Titel darf nicht leer sein.");
  }
}

export async function addItineraryDay(fields: ItineraryDayFields): Promise<Trip> {
  assertItineraryDayFields(fields);

  const trip = await readTrip();
  if (trip.itineraryDays.length >= MAX_ITINERARY_DAYS) {
    throw new TripValidationError(`Der Reiseplan hat das Limit von ${MAX_ITINERARY_DAYS} Tagen erreicht.`);
  }

  trip.itineraryDays.push({
    id: randomUUID(),
    weekday: fields.weekday.trim(),
    dateLabel: fields.dateLabel.trim(),
    title: fields.title.trim(),
    note: fields.note.trim(),
    tone: fields.tone,
    timeline: [],
  });
  return writeTrip(trip);
}

export async function updateItineraryDay(dayId: string, patch: Partial<ItineraryDayFields>): Promise<Trip> {
  assertItineraryDayFields(patch);

  const trip = await readTrip();
  const day = trip.itineraryDays.find((candidate) => candidate.id === dayId);
  if (!day) {
    throw new ItemNotFoundError(`Reisetag nicht gefunden: ${dayId}`);
  }

  if (patch.weekday !== undefined) day.weekday = patch.weekday.trim();
  if (patch.dateLabel !== undefined) day.dateLabel = patch.dateLabel.trim();
  if (patch.title !== undefined) day.title = patch.title.trim();
  if (patch.note !== undefined) day.note = patch.note.trim();
  if (patch.tone !== undefined) day.tone = patch.tone;

  return writeTrip(trip);
}

export async function removeItineraryDay(dayId: string): Promise<Trip> {
  const trip = await readTrip();
  if (trip.itineraryDays.length <= 1) {
    throw new TripValidationError("Der letzte Reisetag kann nicht entfernt werden.");
  }
  const index = trip.itineraryDays.findIndex((day) => day.id === dayId);
  if (index < 0) {
    throw new ItemNotFoundError(`Reisetag nicht gefunden: ${dayId}`);
  }
  trip.itineraryDays.splice(index, 1);
  return writeTrip(trip);
}

export interface TimelineEntryFields {
  time: string;
  title: string;
  note: string;
  highlight: boolean;
  placeId: string | null;
}

function assertTimelineEntryFields(fields: Partial<TimelineEntryFields>): void {
  if (fields.time !== undefined && fields.time.trim().length < 1) {
    throw new TripValidationError("Uhrzeit darf nicht leer sein.");
  }
  if (fields.title !== undefined && fields.title.trim().length < 1) {
    throw new TripValidationError("Titel darf nicht leer sein.");
  }
}

export async function addTimelineEntry(dayId: string, fields: TimelineEntryFields): Promise<Trip> {
  assertTimelineEntryFields(fields);

  const trip = await readTrip();
  const day = trip.itineraryDays.find((candidate) => candidate.id === dayId);
  if (!day) {
    throw new ItemNotFoundError(`Reisetag nicht gefunden: ${dayId}`);
  }
  if (day.timeline.length >= MAX_TIMELINE_ENTRIES_PER_DAY) {
    throw new TripValidationError(`Der Tagesablauf hat das Limit von ${MAX_TIMELINE_ENTRIES_PER_DAY} Einträgen erreicht.`);
  }
  if (fields.placeId && !trip.places.some((place) => place.id === fields.placeId)) {
    throw new TripValidationError(`Ort nicht gefunden: ${fields.placeId}`);
  }

  day.timeline.push({
    id: randomUUID(),
    time: fields.time.trim(),
    title: fields.title.trim(),
    note: fields.note.trim(),
    highlight: fields.highlight,
    placeId: fields.placeId ?? undefined,
  });
  return writeTrip(trip);
}

export async function updateTimelineEntry(entryId: string, patch: Partial<TimelineEntryFields>): Promise<Trip> {
  assertTimelineEntryFields(patch);

  const trip = await readTrip();
  let entry: Trip["itineraryDays"][number]["timeline"][number] | undefined;
  for (const day of trip.itineraryDays) {
    entry = day.timeline.find((candidate) => candidate.id === entryId);
    if (entry) break;
  }
  if (!entry) {
    throw new ItemNotFoundError(`Tagesablauf-Eintrag nicht gefunden: ${entryId}`);
  }
  if (patch.placeId && !trip.places.some((place) => place.id === patch.placeId)) {
    throw new TripValidationError(`Ort nicht gefunden: ${patch.placeId}`);
  }

  if (patch.time !== undefined) entry.time = patch.time.trim();
  if (patch.title !== undefined) entry.title = patch.title.trim();
  if (patch.note !== undefined) entry.note = patch.note.trim();
  if (patch.highlight !== undefined) entry.highlight = patch.highlight;
  if (patch.placeId !== undefined) entry.placeId = patch.placeId ?? undefined;

  return writeTrip(trip);
}

export async function removeTimelineEntry(entryId: string): Promise<Trip> {
  const trip = await readTrip();
  let found = false;
  for (const day of trip.itineraryDays) {
    const index = day.timeline.findIndex((entry) => entry.id === entryId);
    if (index >= 0) {
      day.timeline.splice(index, 1);
      found = true;
      break;
    }
  }
  if (!found) {
    throw new ItemNotFoundError(`Tagesablauf-Eintrag nicht gefunden: ${entryId}`);
  }
  return writeTrip(trip);
}

export interface PlaceFields {
  name: string;
  type: string;
  area: string;
  note: string;
  color: string;
  lat: number | null;
  lon: number | null;
  image: string | null;
}

function assertPlaceFields(fields: Partial<PlaceFields>): void {
  if (fields.name !== undefined && fields.name.trim().length < 1) {
    throw new TripValidationError("Name darf nicht leer sein.");
  }
  if (fields.type !== undefined && fields.type.trim().length < 1) {
    throw new TripValidationError("Kategorie darf nicht leer sein.");
  }
  if (fields.area !== undefined && fields.area.trim().length < 1) {
    throw new TripValidationError("Gebiet darf nicht leer sein.");
  }
  if (fields.color !== undefined && fields.color.trim().length < 1) {
    throw new TripValidationError("Farbe darf nicht leer sein.");
  }
}

export async function addPlace(fields: PlaceFields): Promise<Trip> {
  assertPlaceFields(fields);

  const trip = await readTrip();
  if (trip.places.length >= MAX_PLACES) {
    throw new TripValidationError(`Die Merkliste hat das Limit von ${MAX_PLACES} Orten erreicht.`);
  }

  trip.places.push({
    id: randomUUID(),
    name: fields.name.trim(),
    type: fields.type.trim(),
    area: fields.area.trim(),
    note: fields.note.trim(),
    color: fields.color.trim(),
    lat: fields.lat ?? undefined,
    lon: fields.lon ?? undefined,
    image: fields.image?.trim() ? fields.image.trim() : undefined,
  });
  return writeTrip(trip);
}

export async function updatePlace(placeId: string, patch: Partial<PlaceFields>): Promise<Trip> {
  assertPlaceFields(patch);

  const trip = await readTrip();
  const place = trip.places.find((candidate) => candidate.id === placeId);
  if (!place) {
    throw new ItemNotFoundError(`Ort nicht gefunden: ${placeId}`);
  }

  if (patch.name !== undefined) place.name = patch.name.trim();
  if (patch.type !== undefined) place.type = patch.type.trim();
  if (patch.area !== undefined) place.area = patch.area.trim();
  if (patch.note !== undefined) place.note = patch.note.trim();
  if (patch.color !== undefined) place.color = patch.color.trim();
  if (patch.lat !== undefined) place.lat = patch.lat ?? undefined;
  if (patch.lon !== undefined) place.lon = patch.lon ?? undefined;
  if (patch.image !== undefined) place.image = patch.image?.trim() ? patch.image.trim() : undefined;

  return writeTrip(trip);
}

export async function removePlace(placeId: string): Promise<Trip> {
  const trip = await readTrip();
  const index = trip.places.findIndex((place) => place.id === placeId);
  if (index < 0) {
    throw new ItemNotFoundError(`Ort nicht gefunden: ${placeId}`);
  }
  const [removed] = trip.places.splice(index, 1);

  // A timeline entry that referenced this place would otherwise keep a
  // dangling placeId once the place itself is gone.
  for (const day of trip.itineraryDays) {
    for (const entry of day.timeline) {
      if (entry.placeId === placeId) entry.placeId = undefined;
    }
  }

  const updated = await writeTrip(trip);

  // Clean up the downloaded Google Places photo, if this place had one —
  // it's not referenced by anything else once the place itself is gone.
  const photoPrefix = `${PLACE_PHOTOS_PUBLIC_PATH}/`;
  if (removed.image?.startsWith(photoPrefix)) {
    const filename = removed.image.slice(photoPrefix.length);
    if (filename && !filename.includes("/") && !filename.includes("..")) {
      await rm(path.join(PLACE_PHOTOS_DIR, filename), { force: true }).catch(() => {});
    }
  }

  return updated;
}
