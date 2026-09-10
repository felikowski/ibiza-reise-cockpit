import { addDays, enumerateDates, formatISODate, parseISODate } from "./dates";
import type { Budget, DocumentItem, Packing, Place, Shopping, TimelineEntry, Trip, TripMeta } from "./trip";

export const BUDGET_SHARE_COUNT = 3;

export function formatEuroExact(amount: number): string {
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} €`;
}

export function heroDateRangeLabel(meta: TripMeta): string {
  const start = parseISODate(meta.startDate);
  const end = parseISODate(meta.endDate);
  const month = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(end);
  return `${start.getDate()}.–${end.getDate()}. ${month} ${end.getFullYear()}`;
}

export function nightsBetween(meta: TripMeta): number {
  const start = parseISODate(meta.startDate);
  const end = parseISODate(meta.endDate);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function countdownDays(meta: TripMeta, now: Date = new Date()): number {
  const start = parseISODate(meta.startDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 0);
}

export function budgetGrandTotal(budget: Budget): number {
  return budget.categories.reduce((sum, category) => sum + category.amount, 0);
}

export function perPersonShare(amount: number): number {
  return amount / BUDGET_SHARE_COUNT;
}

export function packingTotals(packing: Packing) {
  const items = packing.groups.flatMap((group) => group.items);
  const total = items.length;
  const packedCount = items.filter((item) => item.checked).length;
  const percent = total > 0 ? Math.round((packedCount / total) * 100) : 0;
  return { total, packedCount, percent };
}

export function shoppingTotals(shopping: Shopping) {
  const items = shopping.categories.flatMap((category) => category.items);
  const total = items.length;
  const checkedCount = items.filter((item) => item.checked).length;
  const percent = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
  return { total, checkedCount, percent };
}

export function confirmedBookings(trip: Trip): { confirmed: number; total: number } {
  const statuses = [
    trip.flights.outbound.status,
    trip.flights.return.status,
    trip.accommodation.status,
    trip.rentalCar.status,
  ];
  return { confirmed: statuses.filter((status) => status === "confirmed").length, total: statuses.length };
}

export function documentsReadiness(documents: DocumentItem[]) {
  const ready = documents.filter((doc) => doc.status !== "Ausstehend").length;
  return { ready, total: documents.length, pending: documents.length - ready };
}

export function readinessPercent(trip: Trip): number {
  const { confirmed, total: bookingsTotal } = confirmedBookings(trip);
  const { ready, total: docsTotal } = documentsReadiness(trip.documents);
  const { percent: packingPercent } = packingTotals(trip.packing);
  const bookingsPercent = bookingsTotal > 0 ? (confirmed / bookingsTotal) * 100 : 100;
  const docsPercent = docsTotal > 0 ? (ready / docsTotal) * 100 : 100;
  return Math.round((bookingsPercent + docsPercent + packingPercent) / 3);
}

export function placeTypes(trip: Trip): string[] {
  const seen = new Set<string>();
  for (const place of trip.places) seen.add(place.type);
  return ["Alle", ...seen];
}

/** Places without real coordinates yet (older data predating the map feature)
 * report lat/lon as undefined. The admin form's number inputs coerce an
 * empty field to 0 rather than leaving it unset, so (0, 0) — Null Island,
 * nowhere near Ibiza — doubles as "not set" here too. */
export function hasCoords(place: Place): place is Place & { lat: number; lon: number } {
  return typeof place.lat === "number" && typeof place.lon === "number" && !(place.lat === 0 && place.lon === 0);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/** Places within a short hop of the finca — walking distance or a couple of
 * minutes' drive, not "somewhere on the island". */
const NEARBY_RADIUS_KM = 5;

export function nearbyPlaces(trip: Trip): Place[] {
  return trip.places.filter(
    (place) =>
      hasCoords(place) &&
      haversineKm(trip.meta.destinationLat, trip.meta.destinationLon, place.lat, place.lon) <= NEARBY_RADIUS_KM,
  );
}

/** Timeline entries sorted chronologically by time ("HH:MM"); entries without
 * a time keep their relative order and sort after all timed entries. */
export function sortedTimeline(timeline: TimelineEntry[]): TimelineEntry[] {
  return [...timeline].sort((a, b) => {
    if (!a.time) return b.time ? 1 : 0;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

export function tripDates(meta: TripMeta): string[] {
  return enumerateDates(meta.startDate, meta.endDate);
}

export interface NamedDay {
  label: string;
  date: string;
}

/** The four Berlin reference days requested alongside the destination forecast:
 * departure day, arrival-at-destination day, return-flight day, and the day after
 * getting back. Departure/arrival share a date for a same-day short-haul flight. */
export function berlinComparisonDays(meta: TripMeta): NamedDay[] {
  return [
    { label: "Abflug", date: meta.startDate },
    { label: "Ankunft", date: meta.startDate },
    { label: "Rückflug", date: meta.endDate },
    { label: "Tag danach", date: formatISODate(addDays(parseISODate(meta.endDate), 1)) },
  ];
}
