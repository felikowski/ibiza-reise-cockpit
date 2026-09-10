"use client";

import { useTrip } from "../app-shell";
import { Discover } from "../sections";

export default function EntdeckenPage() {
  const { trip, setTrip } = useTrip();
  return <Discover trip={trip} onTripChange={setTrip} />;
}
