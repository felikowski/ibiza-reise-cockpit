"use client";

import { useTrip } from "../app-shell";
import { Shopping } from "../sections";

export default function EinkaufslistePage() {
  const { trip, setTrip } = useTrip();
  return <Shopping trip={trip} onTripChange={setTrip} />;
}
