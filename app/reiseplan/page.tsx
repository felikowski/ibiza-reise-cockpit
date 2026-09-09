"use client";

import { useTrip } from "../app-shell";
import { TravelPlan } from "../sections";

export default function ReiseplanPage() {
  const { trip, setTrip } = useTrip();
  return <TravelPlan trip={trip} onTripChange={setTrip} />;
}
