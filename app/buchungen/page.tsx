"use client";

import { useTrip } from "../app-shell";
import { Bookings } from "../sections";

export default function BuchungenPage() {
  const { trip, copied, copyReference } = useTrip();
  return <Bookings trip={trip} copied={copied} onCopy={copyReference} />;
}
