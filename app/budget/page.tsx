"use client";

import { useTrip } from "../app-shell";
import { Budget } from "../sections";

export default function BudgetPage() {
  const { trip } = useTrip();
  return <Budget trip={trip} />;
}
