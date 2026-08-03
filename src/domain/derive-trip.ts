import type { Budget, BudgetCategory, DocumentItem, Packing, Trip, TripMeta } from "./trip";

function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatEuro(amount: number): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(amount)} €`;
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

export function budgetTotals(budget: Budget) {
  const planned = budget.categories.reduce((sum, category) => sum + category.amount, 0);
  const plannedPercent = Math.round((planned / budget.totalBudget) * 100);
  const remaining = budget.totalBudget - planned;
  const paidTotal = budget.paid
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + item.amount, 0);
  return { planned, plannedPercent, remaining, paidTotal };
}

export function categoryPercent(category: BudgetCategory): number {
  return Math.round((category.amount / category.budgeted) * 100);
}

export function dailyBudget(budget: Budget, totalDays: number): number {
  if (totalDays <= 0) return 0;
  const { remaining } = budgetTotals(budget);
  return Math.round(remaining / totalDays);
}

export function packingTotals(packing: Packing, packed: Set<string>) {
  const total = packing.groups.reduce((sum, group) => sum + group.items.length, 0);
  const packedCount = packed.size;
  const percent = total > 0 ? Math.round((packedCount / total) * 100) : 0;
  return { total, packedCount, percent };
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

export function readinessPercent(trip: Trip, packed: Set<string>): number {
  const { confirmed, total: bookingsTotal } = confirmedBookings(trip);
  const { ready, total: docsTotal } = documentsReadiness(trip.documents);
  const { percent: packingPercent } = packingTotals(trip.packing, packed);
  const bookingsPercent = bookingsTotal > 0 ? (confirmed / bookingsTotal) * 100 : 100;
  const docsPercent = docsTotal > 0 ? (ready / docsTotal) * 100 : 100;
  return Math.round((bookingsPercent + docsPercent + packingPercent) / 3);
}

export function placeTypes(trip: Trip): string[] {
  const seen = new Set<string>();
  for (const place of trip.places) seen.add(place.type);
  return ["Alle", ...seen];
}
