"use client";

import { useTrip } from "../app-shell";
import { Discover } from "../sections";

export default function EntdeckenPage() {
  const { trip } = useTrip();
  return <Discover trip={trip} />;
}
