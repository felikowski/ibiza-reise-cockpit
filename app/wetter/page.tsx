"use client";

import { useTrip } from "../app-shell";
import { Weather } from "../sections";

export default function WetterPage() {
  const { trip, weather } = useTrip();
  return <Weather trip={trip} weather={weather} />;
}
