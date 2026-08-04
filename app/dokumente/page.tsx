"use client";

import { useTrip } from "../app-shell";
import { Documents } from "../sections";

export default function DokumentePage() {
  const { trip } = useTrip();
  return <Documents trip={trip} />;
}
