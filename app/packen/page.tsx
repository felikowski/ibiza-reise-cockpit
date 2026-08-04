"use client";

import { useTrip } from "../app-shell";
import { Packing } from "../sections";

export default function PackenPage() {
  const { trip, setTrip } = useTrip();
  return <Packing trip={trip} onTripChange={setTrip} />;
}
