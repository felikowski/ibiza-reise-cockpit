"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Trip } from "@/src/domain/trip";
import { validateTrip } from "@/src/domain/validate-trip";
import { addDays, formatISODate, parseISODate } from "@/src/domain/dates";
import { fetchLocationWeather, type DailyWeather } from "@/src/domain/open-meteo";

export type TabId =
  | "overview"
  | "plan"
  | "bookings"
  | "discover"
  | "budget"
  | "packing"
  | "documents"
  | "weather";

export const tabs: { id: TabId; label: string; symbol: string; path: string }[] = [
  { id: "overview", label: "Übersicht", symbol: "⌂", path: "/" },
  { id: "plan", label: "Reiseplan", symbol: "◎", path: "/reiseplan" },
  { id: "bookings", label: "Buchungen", symbol: "◇", path: "/buchungen" },
  { id: "discover", label: "Entdecken", symbol: "⌖", path: "/entdecken" },
  { id: "weather", label: "Wetter", symbol: "☀", path: "/wetter" },
  { id: "budget", label: "Budget", symbol: "€", path: "/budget" },
  { id: "packing", label: "Packen", symbol: "✓", path: "/packen" },
  { id: "documents", label: "Dokumente", symbol: "▤", path: "/dokumente" },
];

export function tabPath(id: TabId): string {
  return tabs.find((tab) => tab.id === id)?.path ?? "/";
}

function tabForPath(pathname: string): TabId {
  return tabs.find((tab) => tab.path === pathname)?.id ?? "overview";
}

export type WeatherState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; destination: Map<string, DailyWeather>; origin: Map<string, DailyWeather> };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; trip: Trip };

interface TripContextValue {
  trip: Trip;
  setTrip: (trip: Trip) => void;
  weather: WeatherState;
  copied: string | null;
  copyReference: (reference: string) => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function useTrip(): TripContextValue {
  const context = useContext(TripContext);
  if (!context) throw new Error("useTrip must be used within a TripProvider");
  return context;
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/trip", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Server antwortete mit ${response.status}`);
        }
        const json = await response.json();
        const result = validateTrip(json);
        if (!result.success) {
          throw new Error(result.error);
        }
        if (!cancelled) setState({ status: "ready", trip: result.data });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Unbekannter Fehler",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <main className="state-screen">
        <p className="sample-badge">Lädt …</p>
        <h1>Reisedaten werden geladen</h1>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="state-screen">
        <h1>Reisedaten konnten nicht geladen werden</h1>
        <p>{state.message}</p>
        <button onClick={() => window.location.reload()}>Erneut versuchen</button>
      </main>
    );
  }

  return <TripShell initialTrip={state.trip}>{children}</TripShell>;
}

function TripShell({ initialTrip, children }: { initialTrip: Trip; children: React.ReactNode }) {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [copied, setCopied] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const dayAfterReturn = formatISODate(addDays(parseISODate(trip.meta.endDate), 1));
        const [destination, origin] = await Promise.all([
          fetchLocationWeather(trip.meta.destinationLat, trip.meta.destinationLon, trip.meta.startDate, trip.meta.endDate),
          fetchLocationWeather(trip.meta.originLat, trip.meta.originLon, trip.meta.startDate, dayAfterReturn),
        ]);
        if (!cancelled) setWeather({ status: "ready", destination, origin });
      } catch (error) {
        if (!cancelled) {
          setWeather({
            status: "error",
            message: error instanceof Error ? error.message : "Unbekannter Fehler",
          });
        }
      }
    }

    loadWeather();
    return () => {
      cancelled = true;
    };
  }, [trip.meta.destinationLat, trip.meta.destinationLon, trip.meta.originLat, trip.meta.originLon, trip.meta.startDate, trip.meta.endDate]);

  const copyReference = async (reference: string) => {
    await navigator.clipboard?.writeText(reference);
    setCopied(reference);
    window.setTimeout(() => setCopied(null), 1400);
  };

  return (
    <TripContext.Provider value={{ trip, setTrip, weather, copied, copyReference }}>
      <Chrome>{children}</Chrome>
    </TripContext.Provider>
  );
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { trip } = useTrip();
  const pathname = usePathname();
  const activeTab = tabForPath(pathname);
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "Übersicht";

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Zur Übersicht">
          <span className="brand-mark">IBZ</span>
          <span>
            <strong>Isla</strong>
            <small>Reise-Cockpit</small>
          </span>
        </Link>

        <nav className="tabbar" aria-label="Reisebereiche">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.path}
              className={activeTab === tab.id ? "tab active" : "tab"}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <span className="tab-symbol" aria-hidden="true">{tab.symbol}</span>
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="travelers" aria-label={`${trip.meta.travelersCount} Reisende`}>
          <span className="avatar avatar-one">F</span>
          <span className="avatar avatar-two">+{trip.meta.travelersCount - 1}</span>
        </div>
      </header>

      <div className="mobile-section-title">{activeLabel}</div>

      {children}
    </main>
  );
}
