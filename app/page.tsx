"use client";

import { useRouter } from "next/navigation";
import { tabPath, useTrip, type TabId } from "./app-shell";
import { Overview } from "./sections";

export default function OverviewPage() {
  const { trip, weather } = useTrip();
  const router = useRouter();
  return <Overview trip={trip} weather={weather} onNavigate={(tab: TabId) => router.push(tabPath(tab))} />;
}
