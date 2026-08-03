export type DayTone = "sun" | "water" | "peach" | "sage" | "stone";
export type BookingStatus = "confirmed" | "pending";
export type PaidStatus = "paid" | "on_site";

export interface FlightLeg {
  dateLabel: string;
  departureTime: string;
  departureAirport: string;
  departureCity: string;
  arrivalTime: string;
  arrivalAirport: string;
  arrivalCity: string;
  carrier: string;
  flightNumber: string;
  durationLabel: string;
  terminal: string;
  status: BookingStatus;
  referenceCode: string;
}

export interface Accommodation {
  name: string;
  area: string;
  dateRangeLabel: string;
  notes: string;
  referenceCode: string;
  status: BookingStatus;
}

export interface RentalCar {
  category: string;
  provider: string;
  notes: string;
  pickupLabel: string;
  dropoffLabel: string;
  referenceCode: string;
  status: BookingStatus;
}

export interface TimelineEntry {
  time: string;
  title: string;
  note: string;
  highlight: boolean;
}

export interface ItineraryDay {
  weekday: string;
  dateLabel: string;
  title: string;
  note: string;
  tone: DayTone;
  timeline: TimelineEntry[];
}

export interface Place {
  name: string;
  type: string;
  area: string;
  note: string;
  color: string;
}

export interface BudgetCategory {
  name: string;
  amount: number;
  budgeted: number;
  color: string;
}

export interface PaidItem {
  label: string;
  amount: number;
  status: PaidStatus;
}

export interface Budget {
  totalBudget: number;
  categories: BudgetCategory[];
  paid: PaidItem[];
}

export interface PackingPerson {
  id: string;
  name: string;
}

export interface PackingItem {
  id: string;
  label: string;
  assignedTo: string | null;
  checked: boolean;
}

export interface PackingGroup {
  title: string;
  items: PackingItem[];
}

export interface Packing {
  people: PackingPerson[];
  groups: PackingGroup[];
}

export interface DocumentItem {
  title: string;
  meta: string;
  status: string;
  symbol: string;
}

export interface EmergencyContact {
  label: string;
  phone: string;
}

export interface PracticalFact {
  label: string;
  value: string;
}

export interface TripMeta {
  title: string;
  titleAccent: string;
  routeFrom: string;
  routeTo: string;
  travelersCount: number;
  accommodationLabel: string;
  startDate: string;
  endDate: string;
  originCity: string;
  originLat: number;
  originLon: number;
  destinationCity: string;
  destinationLat: number;
  destinationLon: number;
}

export interface InsiderTip {
  quote: string;
}

export interface CheckInReminder {
  title: string;
  note: string;
  dateLabel: string;
}

export interface Trip {
  meta: TripMeta;
  flights: {
    outbound: FlightLeg;
    return: FlightLeg;
  };
  accommodation: Accommodation;
  rentalCar: RentalCar;
  itineraryDays: ItineraryDay[];
  places: Place[];
  budget: Budget;
  packing: Packing;
  documents: DocumentItem[];
  emergencyContacts: EmergencyContact[];
  practicalFacts: PracticalFact[];
  insiderTip: InsiderTip;
  checkInReminder: CheckInReminder;
}
