import { z } from "zod";
import type { Trip } from "./trip";

const dayToneSchema = z.enum(["sun", "water", "peach", "sage", "stone"]);
const bookingStatusSchema = z.enum(["confirmed", "pending"]);
const paidStatusSchema = z.enum(["paid", "on_site"]);

const flightLegSchema = z.object({
  dateLabel: z.string().min(1),
  departureTime: z.string().min(1),
  departureAirport: z.string().min(1),
  departureCity: z.string().min(1),
  arrivalTime: z.string().min(1),
  arrivalAirport: z.string().min(1),
  arrivalCity: z.string().min(1),
  carrier: z.string().min(1),
  flightNumber: z.string().min(1),
  durationLabel: z.string().min(1),
  terminal: z.string(),
  status: bookingStatusSchema,
  referenceCode: z.string().min(1),
});

const accommodationSchema = z.object({
  name: z.string().min(1),
  area: z.string().min(1),
  dateRangeLabel: z.string().min(1),
  notes: z.string(),
  referenceCode: z.string().min(1),
  status: bookingStatusSchema,
});

const rentalCarSchema = z.object({
  category: z.string().min(1),
  provider: z.string().min(1),
  notes: z.string(),
  pickupLabel: z.string().min(1),
  dropoffLabel: z.string().min(1),
  referenceCode: z.string().min(1),
  status: bookingStatusSchema,
});

const timelineEntrySchema = z.object({
  time: z.string().min(1),
  title: z.string().min(1),
  note: z.string(),
  highlight: z.boolean(),
});

const itineraryDaySchema = z.object({
  weekday: z.string().min(1),
  dateLabel: z.string().min(1),
  title: z.string().min(1),
  note: z.string(),
  tone: dayToneSchema,
  timeline: z.array(timelineEntrySchema).min(1),
});

const placeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  area: z.string().min(1),
  note: z.string(),
  color: z.string().min(1),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});

const budgetCategorySchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  budgeted: z.number().positive(),
  color: z.string().min(1),
});

const paidItemSchema = z.object({
  label: z.string().min(1),
  amount: z.number().nonnegative(),
  status: paidStatusSchema,
});

const budgetSchema = z.object({
  totalBudget: z.number().positive(),
  categories: z.array(budgetCategorySchema).min(1),
  paid: z.array(paidItemSchema).min(1),
});

const packingPersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const packingItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  assignedTo: z.string().min(1).nullable(),
  checked: z.boolean(),
});

const packingGroupSchema = z.object({
  title: z.string().min(1),
  items: z.array(packingItemSchema),
});

const packingSchema = z.object({
  people: z.array(packingPersonSchema).min(1),
  groups: z.array(packingGroupSchema).min(1),
});

const documentItemSchema = z.object({
  title: z.string().min(1),
  meta: z.string(),
  status: z.string().min(1),
  symbol: z.string().min(1),
});

const emergencyContactSchema = z.object({
  label: z.string().min(1),
  phone: z.string().min(1),
});

const practicalFactSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const tripMetaSchema = z.object({
  title: z.string().min(1),
  titleAccent: z.string().min(1),
  routeFrom: z.string().min(1),
  routeTo: z.string().min(1),
  travelersCount: z.number().int().positive(),
  accommodationLabel: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  originCity: z.string().min(1),
  originLat: z.number().min(-90).max(90),
  originLon: z.number().min(-180).max(180),
  destinationCity: z.string().min(1),
  destinationLat: z.number().min(-90).max(90),
  destinationLon: z.number().min(-180).max(180),
});

const insiderTipSchema = z.object({
  quote: z.string().min(1),
});

const checkInReminderSchema = z.object({
  title: z.string().min(1),
  note: z.string(),
  dateLabel: z.string().min(1),
});

export const tripSchema = z.object({
  meta: tripMetaSchema,
  flights: z.object({
    outbound: flightLegSchema,
    return: flightLegSchema,
  }),
  accommodation: accommodationSchema,
  rentalCar: rentalCarSchema,
  itineraryDays: z.array(itineraryDaySchema).min(1),
  places: z.array(placeSchema),
  budget: budgetSchema,
  packing: packingSchema,
  documents: z.array(documentItemSchema),
  emergencyContacts: z.array(emergencyContactSchema),
  practicalFacts: z.array(practicalFactSchema),
  insiderTip: insiderTipSchema,
  checkInReminder: checkInReminderSchema,
}) satisfies z.ZodType<Trip>;

export type TripValidationResult =
  | { success: true; data: Trip }
  | { success: false; error: string };

export function validateTrip(input: unknown): TripValidationResult {
  const result = tripSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
}
