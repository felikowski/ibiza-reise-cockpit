"use client";

import { useEffect, useMemo, useState } from "react";
import type { PackingItem, Trip } from "@/src/domain/trip";
import { validateTrip } from "@/src/domain/validate-trip";
import {
  budgetTotals,
  categoryPercent,
  confirmedBookings,
  countdownDays,
  dailyBudget,
  documentsReadiness,
  formatEuro,
  hasCoords,
  heroDateRangeLabel,
  nearbyPlaces,
  nightsBetween,
  packingTotals,
  placeTypes,
  readinessPercent,
  berlinComparisonDays,
  tripDates,
} from "@/src/domain/derive-trip";
import { addDays, formatISODate, parseISODate } from "@/src/domain/dates";
import { fetchLocationWeather, type DailyWeather } from "@/src/domain/open-meteo";
import { describeWeatherCode } from "@/src/domain/weather-codes";
import DiscoverMap, { googleMapsUrl } from "./discover-map";

type TabId =
  | "overview"
  | "plan"
  | "bookings"
  | "discover"
  | "budget"
  | "packing"
  | "documents"
  | "weather";

const tabs: { id: TabId; label: string; symbol: string }[] = [
  { id: "overview", label: "Übersicht", symbol: "⌂" },
  { id: "plan", label: "Reiseplan", symbol: "◎" },
  { id: "bookings", label: "Buchungen", symbol: "◇" },
  { id: "discover", label: "Entdecken", symbol: "⌖" },
  { id: "weather", label: "Wetter", symbol: "☀" },
  { id: "budget", label: "Budget", symbol: "€" },
  { id: "packing", label: "Packen", symbol: "✓" },
  { id: "documents", label: "Dokumente", symbol: "▤" },
];

async function submitPackingRequest(url: string, method: string, body?: unknown): Promise<Trip> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Server antwortete mit ${response.status}`);
  }
  return payload.trip as Trip;
}

function addPackingItem(
  groupTitle: string,
  label: string,
  scope: "personal" | "shared",
  assignedTo: string | null,
): Promise<Trip> {
  return submitPackingRequest("/api/packing/items", "POST", { groupTitle, label, scope, assignedTo });
}

function patchPackingItem(itemId: string, patch: { checked?: boolean; assignedTo?: string | null }): Promise<Trip> {
  return submitPackingRequest(`/api/packing/items/${itemId}`, "PATCH", patch);
}

function removePackingItem(itemId: string): Promise<Trip> {
  return submitPackingRequest(`/api/packing/items/${itemId}`, "DELETE");
}

type WeatherState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; destination: Map<string, DailyWeather>; origin: Map<string, DailyWeather> };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; trip: Trip };

export default function Home() {
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

  return <Dashboard initialTrip={state.trip} />;
}

function Dashboard({ initialTrip }: { initialTrip: Trip }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
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

  const activeLabel = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label ?? "Übersicht",
    [activeTab],
  );

  const packingStats = packingTotals(trip.packing);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveTab("overview")} aria-label="Zur Übersicht">
          <span className="brand-mark">IBZ</span>
          <span>
            <strong>Isla</strong>
            <small>Reise-Cockpit</small>
          </span>
        </button>

        <nav className="tabbar" aria-label="Reisebereiche">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "tab active" : "tab"}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <span className="tab-symbol" aria-hidden="true">{tab.symbol}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="travelers" aria-label={`${trip.meta.travelersCount} Reisende`}>
          <span className="avatar avatar-one">F</span>
          <span className="avatar avatar-two">+{trip.meta.travelersCount - 1}</span>
        </div>
      </header>

      <div className="mobile-section-title">{activeLabel}</div>

      {activeTab === "overview" && (
        <Overview trip={trip} weather={weather} onNavigate={setActiveTab} />
      )}
      {activeTab === "plan" && <TravelPlan trip={trip} />}
      {activeTab === "bookings" && <Bookings trip={trip} copied={copied} onCopy={copyReference} />}
      {activeTab === "discover" && <Discover trip={trip} />}
      {activeTab === "weather" && <Weather trip={trip} weather={weather} />}
      {activeTab === "budget" && <Budget trip={trip} />}
      {activeTab === "packing" && <Packing trip={trip} onTripChange={setTrip} />}
      {activeTab === "documents" && <Documents trip={trip} />}
    </main>
  );
}

function Overview({
  trip,
  weather,
  onNavigate,
}: {
  trip: Trip;
  weather: WeatherState;
  onNavigate: (tab: TabId) => void;
}) {
  const nights = nightsBetween(trip.meta);
  const countdown = countdownDays(trip.meta);
  const totals = budgetTotals(trip.budget);
  const bookings = confirmedBookings(trip);
  const docs = documentsReadiness(trip.documents);
  const packingStats = packingTotals(trip.packing);
  const readiness = readinessPercent(trip);
  const outbound = trip.flights.outbound;

  return (
    <section className="page page-overview">
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> DEINE REISE</div>
          <h1>{trip.meta.title}<br /><em>{trip.meta.titleAccent}</em></h1>
          <p className="hero-dates">{heroDateRangeLabel(trip.meta)} <span>·</span> {nights} Nächte</p>
          <div className="hero-meta">
            <span>{trip.meta.routeFrom} <b>→</b> {trip.meta.routeTo}</span>
            <span>{trip.meta.travelersCount} Reisende</span>
            <span>{trip.meta.accommodationLabel}</span>
          </div>
          <div className="sample-badge">Beispieldaten · frei anpassbar</div>
        </div>

        <div className="countdown-card">
          <span className="sun-disc" />
          <div className="countdown-label">Noch</div>
          <div className="countdown-number">{countdown}</div>
          <div className="countdown-days">Tage</div>
          <div className="countdown-rule" />
          <p>Vorfreude ist<br />die schönste Reisezeit.</p>
        </div>
      </div>

      <div className="content-grid">
        <section className="card next-card">
          <CardHeader kicker="Als Nächstes" title="Abflug nach Ibiza" action="Alle Buchungen" onAction={() => onNavigate("bookings")} />
          <div className="flight-row">
            <div><span className="time">{outbound.departureTime}</span><span className="airport">{outbound.departureCity} · {outbound.departureAirport}</span></div>
            <div className="flight-path"><span>{outbound.flightNumber}</span><div><i /><b>✦</b><i /></div><small>{outbound.durationLabel}</small></div>
            <div className="align-right"><span className="time">{outbound.arrivalTime}</span><span className="airport">{outbound.arrivalCity} · {outbound.arrivalAirport}</span></div>
          </div>
          <div className="flight-footer">
            <span><b>{outbound.dateLabel}</b> · {outbound.terminal}</span>
            <span className="status-dot">{outbound.status === "confirmed" ? "Bestätigt" : "Ausstehend"}</span>
          </div>
        </section>

        <section className="card weather-card">
          <CardHeader kicker="Vor Ort" title="Sonne in Sicht" action="Wetter im Detail" onAction={() => onNavigate("weather")} />
          <OverviewWeather trip={trip} weather={weather} />
        </section>

        <section className="card itinerary-card">
          <CardHeader kicker="Deine Woche" title="Sieben Tage Inselzeit" action="Ganzer Reiseplan" onAction={() => onNavigate("plan")} />
          <div className="mini-days">
            {trip.itineraryDays.slice(0, 5).map((item, index) => (
              <div className={index === 0 ? "mini-day current" : "mini-day"} key={item.dateLabel}>
                <div><span>{item.weekday}</span><b>{item.dateLabel.split(" ")[0]}</b></div>
                <i className={`day-dot ${item.tone}`} />
                <p><strong>{item.title}</strong><span>{item.note}</span></p>
              </div>
            ))}
          </div>
        </section>

        <section className="card prep-card">
          <CardHeader kicker="Gut vorbereitet" title="Alles im grünen Bereich" />
          <div className="readiness">
            <div className="readiness-ring"><span>{readiness}<small>%</small></span></div>
            <div className="readiness-list">
              <button onClick={() => onNavigate("bookings")}>
                <i className={bookings.confirmed === bookings.total ? "done" : "open"}>{bookings.confirmed === bookings.total ? "✓" : bookings.total - bookings.confirmed}</i>
                <span><b>Buchungen</b><small>{bookings.confirmed} von {bookings.total} bestätigt</small></span><em>›</em>
              </button>
              <button onClick={() => onNavigate("documents")}>
                <i className={docs.pending === 0 ? "done" : "open"}>{docs.pending === 0 ? "✓" : docs.pending}</i>
                <span><b>Dokumente</b><small>{docs.pending === 0 ? "Alles griffbereit" : `${docs.pending} ausstehend`}</small></span><em>›</em>
              </button>
              <button onClick={() => onNavigate("packing")}>
                <i className={packingStats.total - packingStats.packedCount === 0 ? "done" : "open"}>{packingStats.total - packingStats.packedCount === 0 ? "✓" : packingStats.total - packingStats.packedCount}</i>
                <span><b>Packliste</b><small>{packingStats.total - packingStats.packedCount === 0 ? "Fertig gepackt" : `Noch ${packingStats.total - packingStats.packedCount} Dinge offen`}</small></span><em>›</em>
              </button>
            </div>
          </div>
        </section>

        <section className="card budget-mini-card">
          <CardHeader kicker="Reisekasse" title="Budget im Blick" action="Details" onAction={() => onNavigate("budget")} />
          <div className="budget-total"><strong>{formatEuro(totals.planned)}</strong><span>von {formatEuro(trip.budget.totalBudget)} verplant</span></div>
          <div className="progress"><span style={{ width: `${totals.plannedPercent}%` }} /></div>
          <div className="budget-labels"><span>{totals.plannedPercent} % genutzt</span><b>{formatEuro(totals.remaining)} übrig</b></div>
        </section>

        <section className="card tip-card">
          <span className="tip-number">01</span>
          <div className="eyebrow light"><span /> INSIDER-TIPP</div>
          <blockquote>„{trip.insiderTip.quote}“</blockquote>
          <button onClick={() => onNavigate("discover")}>Ort ansehen <span>↗</span></button>
        </section>
      </div>
    </section>
  );
}

function OverviewWeather({ trip, weather }: { trip: Trip; weather: WeatherState }) {
  if (weather.status === "loading") {
    return <p className="weather-status">Lädt Wetterdaten …</p>;
  }
  if (weather.status === "error") {
    return <p className="weather-status">Wetter derzeit nicht verfügbar.</p>;
  }

  const dates = tripDates(trip.meta);
  const today = weather.destination.get(dates[0]);
  if (!today) return <p className="weather-status">Keine Wetterdaten für diesen Zeitraum.</p>;
  const todayInfo = describeWeatherCode(today.weatherCode);

  return (
    <>
      <div className="weather-main">
        <div className="weather-icon"><span aria-hidden="true">{todayInfo.symbol}</span></div>
        <div><strong>{today.tempMax}°</strong><span>{todayInfo.label}{today.kind === "average" ? " · Ø" : ""}</span></div>
      </div>
      <div className="forecast">
        {dates.slice(0, 4).map((date) => {
          const day = weather.destination.get(date);
          if (!day) return null;
          const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(parseISODate(date));
          return (
            <div key={date}><span>{weekday}</span><i>{describeWeatherCode(day.weatherCode).symbol}</i><b>{day.tempMax}°</b></div>
          );
        })}
      </div>
    </>
  );
}

function Weather({ trip, weather }: { trip: Trip; weather: WeatherState }) {
  if (weather.status === "loading") {
    return (
      <section className="page inner-page">
        <PageIntro eyebrow="WETTER" title="Wie wird's auf Ibiza?" copy="Live-Vorhersage für dein Reiseziel, dazu Berlin im Vergleich." />
        <p className="weather-status card">Lädt Wetterdaten …</p>
      </section>
    );
  }
  if (weather.status === "error") {
    return (
      <section className="page inner-page">
        <PageIntro eyebrow="WETTER" title="Wie wird's auf Ibiza?" copy="Live-Vorhersage für dein Reiseziel, dazu Berlin im Vergleich." />
        <p className="weather-status card">Wetterdaten konnten nicht geladen werden: {weather.message}</p>
      </section>
    );
  }

  const dates = tripDates(trip.meta);
  const berlinDays = berlinComparisonDays(trip.meta);

  return (
    <section className="page inner-page">
      <PageIntro eyebrow="WETTER" title="Wie wird's auf Ibiza?" copy="Live-Vorhersage für dein Reiseziel, dazu Berlin im Vergleich." />
      <div className="weather-layout">
        <div className="card weather-detail-card">
          <CardHeader kicker={trip.meta.destinationCity} title="Reisewetter, Tag für Tag" />
          <div className="weather-day-grid">
            {dates.map((date) => {
              const day = weather.destination.get(date);
              if (!day) return null;
              const info = describeWeatherCode(day.weatherCode);
              const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(parseISODate(date));
              const dayNumber = parseISODate(date).getDate();
              return (
                <div className="weather-day" key={date}>
                  <span>{weekday} {dayNumber}.</span>
                  <i aria-hidden="true">{info.symbol}</i>
                  <b>{day.tempMax}°</b>
                  <small>{day.tempMin}°</small>
                  <em className={`weather-kind weather-kind-${day.kind}`}>{weatherKindLabel(day.kind)}</em>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card weather-berlin-card">
          <CardHeader kicker={trip.meta.originCity} title="Zuhause im Vergleich" />
          <div className="weather-berlin-grid">
            {berlinDays.map((entry) => {
              const day = weather.origin.get(entry.date);
              if (!day) return null;
              const info = describeWeatherCode(day.weatherCode);
              const dateLabel = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(parseISODate(entry.date));
              return (
                <div className="weather-berlin-row" key={entry.label}>
                  <span>{entry.label}<small>{dateLabel}</small></span>
                  <i aria-hidden="true">{info.symbol}</i>
                  <b>{day.tempMax}° / {day.tempMin}°</b>
                  <em className={`weather-kind weather-kind-${day.kind}`}>{weatherKindLabel(day.kind)}</em>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function weatherKindLabel(kind: DailyWeather["kind"]): string {
  if (kind === "forecast") return "Vorhersage";
  if (kind === "recorded") return "Aufgezeichnet";
  return "Ø 5 Jahre";
}

function TravelPlan({ trip }: { trip: Trip }) {
  const [selected, setSelected] = useState(0);
  const detail = trip.itineraryDays[selected];
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="REISEPLAN" title="Acht Tage, genau dein Tempo." copy="Alle Etappen auf einen Blick — mit genug Luft für spontane Inselmomente." />
      <div className="plan-layout">
        <div className="day-selector" role="tablist" aria-label="Reisetage">
          {trip.itineraryDays.map((item, index) => (
            <button key={item.dateLabel} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} role="tab" aria-selected={selected === index}>
              <span>{item.weekday}</span><b>{item.dateLabel.split(" ")[0]}</b><small>{item.dateLabel.split(" ")[1]}</small>
            </button>
          ))}
        </div>
        <div className="card day-detail">
          <div className="day-detail-head">
            <div><span>{detail.dateLabel} · Tag {selected + 1}</span><h2>{detail.title}</h2><p>{detail.note}</p></div>
            <i className={`large-day-dot ${detail.tone}`} />
          </div>
          <div className="timeline">
            {detail.timeline.map((entry) => (
              <div className="timeline-row" key={`${entry.time}-${entry.title}`}><time>{entry.time}</time><i className={entry.highlight ? "accent" : ""} /><div><b>{entry.title}</b><span>{entry.note}</span></div>{entry.highlight && <em>Highlight</em>}</div>
            ))}
          </div>
        </div>
        <aside className="card plan-note">
          <span className="note-icon">☼</span>
          <h3>Raum für Spontanes</h3>
          <p>Plane nie mehr als zwei feste Punkte pro Tag. Die schönsten Buchten liegen oft dazwischen.</p>
          <div><span>Reservierungen</span><b>2 offen</b></div>
          <div><span>Freie Zeit</span><b>3 halbe Tage</b></div>
        </aside>
      </div>
    </section>
  );
}

function Bookings({ trip, copied, onCopy }: { trip: Trip; copied: string | null; onCopy: (reference: string) => void }) {
  const { outbound, return: returnFlight } = trip.flights;
  const { accommodation, rentalCar } = trip;
  const bookings = [
    {
      type: "FLUG · HIN",
      title: `${outbound.departureCity} → ${outbound.arrivalCity}`,
      date: `${outbound.dateLabel} · ${outbound.departureTime}–${outbound.arrivalTime}`,
      vendor: `${outbound.carrier} · ${outbound.flightNumber}`,
      ref: outbound.referenceCode,
      status: outbound.status,
      accent: "coral",
    },
    {
      type: "UNTERKUNFT",
      title: accommodation.name,
      date: accommodation.dateRangeLabel,
      vendor: `${accommodation.area} · ${accommodation.notes}`,
      ref: accommodation.referenceCode,
      status: accommodation.status,
      accent: "sage",
    },
    {
      type: "MIETWAGEN",
      title: rentalCar.category,
      date: `${rentalCar.pickupLabel} – ${rentalCar.dropoffLabel}`,
      vendor: `${rentalCar.provider} · ${rentalCar.notes}`,
      ref: rentalCar.referenceCode,
      status: rentalCar.status,
      accent: "sun",
    },
    {
      type: "FLUG · ZURÜCK",
      title: `${returnFlight.departureCity} → ${returnFlight.arrivalCity}`,
      date: `${returnFlight.dateLabel} · ${returnFlight.departureTime}–${returnFlight.arrivalTime}`,
      vendor: `${returnFlight.carrier} · ${returnFlight.flightNumber}`,
      ref: returnFlight.referenceCode,
      status: returnFlight.status,
      accent: "blue",
    },
  ];
  const confirmed = bookings.filter((booking) => booking.status === "confirmed").length;
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="BUCHUNGEN" title="Alles bestätigt. Alles an einem Ort." copy="Flüge, Unterkunft und Mobilität — inklusive Referenzen für den schnellen Zugriff." />
      <div className="booking-summary"><span><i className="done">✓</i><b>{confirmed} von {bookings.length} bestätigt</b></span><p>Letzte Prüfung: heute</p></div>
      <div className="booking-grid">
        {bookings.map((booking) => (
          <article className="card booking-card" key={`${booking.type}-${booking.title}`}>
            <span className={`booking-accent ${booking.accent}`} />
            <div className="booking-type">{booking.type}<span className="status-dot">{booking.status === "confirmed" ? "Bestätigt" : "Ausstehend"}</span></div>
            <h2>{booking.title}</h2>
            <p>{booking.date}</p>
            <p className="booking-vendor">{booking.vendor}</p>
            <div className="reference"><span><small>Buchungsnummer</small><b>{booking.ref}</b></span><button onClick={() => onCopy(booking.ref)}>{copied === booking.ref ? "Kopiert ✓" : "Kopieren"}</button></div>
          </article>
        ))}
      </div>
      <div className="card booking-tip"><span>i</span><div><b>{trip.checkInReminder.title}</b><p>{trip.checkInReminder.note}</p></div><time>{trip.checkInReminder.dateLabel}</time></div>
    </section>
  );
}

const NEARBY_FILTER = "In der Nähe";

function Discover({ trip }: { trip: Trip }) {
  const [filter, setFilter] = useState("Alle");
  const filterOptions = ["Alle", NEARBY_FILTER, ...placeTypes(trip).slice(1)];
  const visible =
    filter === "Alle" ? trip.places : filter === NEARBY_FILTER ? nearbyPlaces(trip) : trip.places.filter((place) => place.type === filter);
  const home = {
    lat: trip.meta.destinationLat,
    lon: trip.meta.destinationLon,
    title: trip.accommodation.name,
    subtitle: `Eure Finca · ${trip.accommodation.area}`,
  };
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="ENTDECKEN" title="Orte, die nach Inselzeit schmecken." copy="Deine Merkliste für Buchten, Dörfer, gutes Essen und die besten Aussichten." />
      <div className="filter-row">{filterOptions.map((item) => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "active" : ""}>{item}</button>)}</div>
      <div className="places-layout">
        <DiscoverMap home={home} places={visible} />
        <div className="place-grid">
          {visible.map((place, index) => (
            <article className="card place-card" key={place.name}>
              <span className={`place-color ${place.color}`}>{String(index + 1).padStart(2, "0")}</span>
              <div><small>{place.type} · {place.area}</small><h2>{place.name}</h2><p>{place.note}</p></div>
              {hasCoords(place) ? (
                <a className="place-open" href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer" aria-label={`${place.name} in Google Maps öffnen`}>↗</a>
              ) : (
                <span className="place-open place-open-disabled" aria-hidden="true">↗</span>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Budget({ trip }: { trip: Trip }) {
  const totals = budgetTotals(trip.budget);
  const totalDays = trip.itineraryDays.length;
  const daily = dailyBudget(trip.budget, totalDays);
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="BUDGET" title="Mehr Insel, weniger Kopfrechnen." copy="Geplante und bereits bezahlte Kosten, sauber nach Kategorien sortiert." />
      <div className="budget-dashboard">
        <div className="card big-budget">
          <span>Gesamtbudget</span><strong>{formatEuro(trip.budget.totalBudget)}</strong><p>für {trip.meta.travelersCount} Personen · {totalDays} Tage</p>
          <div className="big-progress"><i style={{ width: `${totals.plannedPercent}%` }} /></div>
          <div><span><b>{formatEuro(totals.planned)}</b> verplant</span><span><b>{formatEuro(totals.remaining)}</b> verfügbar</span></div>
        </div>
        <div className="card daily-budget"><span>Freies Tagesbudget</span><strong>{formatEuro(daily)}</strong><p>pro Reisetag für euch beide</p><small>Auf Basis des Restbudgets</small></div>
        <div className="card category-budget">
          <CardHeader kicker="Kategorien" title="So verteilt sich die Reisekasse" />
          {trip.budget.categories.map((category) => <div className="category-row" key={category.name}><span>{category.name}</span><div><i className={category.color} style={{ width: `${categoryPercent(category)}%` }} /></div><b>{formatEuro(category.amount)}</b></div>)}
        </div>
        <div className="card paid-list"><CardHeader kicker="Status" title="Schon bezahlt" />
          {trip.budget.paid.map((item) => (
            <div key={item.label}><span>{item.label}</span><b>{formatEuro(item.amount)}</b><i className={item.status === "on_site" ? "open" : undefined}>{item.status === "on_site" ? "vor Ort" : "✓"}</i></div>
          ))}
          <footer><span>Bezahlt</span><strong>{formatEuro(totals.paidTotal)}</strong></footer>
        </div>
      </div>
    </section>
  );
}

const SHARED_TAB_ID = "shared";

function Packing({ trip, onTripChange }: { trip: Trip; onTripChange: (trip: Trip) => void }) {
  const [personTab, setPersonTab] = useState<string>(trip.packing.people[0]?.id ?? SHARED_TAB_ID);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const packingStats = packingTotals(trip.packing);
  const groupTitles = trip.packing.groups.map((group) => group.title);

  const run = async (action: () => Promise<Trip>) => {
    setPending(true);
    setError(null);
    try {
      onTripChange(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setPending(false);
    }
  };

  const toggleChecked = (item: PackingItem) => run(() => patchPackingItem(item.id, { checked: !item.checked }));
  const removeItem = (item: PackingItem) => run(() => removePackingItem(item.id));
  const assignItem = (item: PackingItem, personId: string | null) => run(() => patchPackingItem(item.id, { assignedTo: personId }));
  const addItem = (groupTitle: string, label: string, scope: "personal" | "shared", assignedTo: string | null) =>
    run(() => addPackingItem(groupTitle, label, scope, assignedTo));

  const tabs = [...trip.packing.people.map((person) => ({ id: person.id, label: person.name })), { id: SHARED_TAB_ID, label: "Gesamt" }];

  return (
    <section className="page inner-page">
      <PageIntro eyebrow="PACKLISTE" title="Leicht packen. Nichts vergessen." copy="Die wichtigsten Dinge für Sonne, Strand und entspannte Abende." />
      <div className="packing-head card"><div className="packing-ring" style={{ "--progress": `${packingStats.percent * 3.6}deg` } as React.CSSProperties}><span>{packingStats.percent}<small>%</small></span></div><div><span>Dein Fortschritt</span><h2>{packingStats.packedCount} von {packingStats.total} eingepackt</h2><p>{packingStats.total - packingStats.packedCount === 0 ? "Fertig — der Urlaub kann kommen." : `Noch ${packingStats.total - packingStats.packedCount} Dinge, dann bist du startklar.`}</p></div></div>

      <div className="packing-people" role="tablist" aria-label="Packbereiche">
        {tabs.map((tab) => (
          <button key={tab.id} className={personTab === tab.id ? "selected" : ""} onClick={() => setPersonTab(tab.id)} role="tab" aria-selected={personTab === tab.id}>
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="packing-error">{error}</p>}

      {personTab === SHARED_TAB_ID ? (
        <PackingSharedView
          trip={trip}
          groupTitles={groupTitles}
          pending={pending}
          onToggle={toggleChecked}
          onRemove={removeItem}
          onAssign={assignItem}
          onAdd={(groupTitle, label, assignedTo) => addItem(groupTitle, label, "shared", assignedTo)}
        />
      ) : (
        <PackingPersonView
          trip={trip}
          personId={personTab}
          groupTitles={groupTitles}
          pending={pending}
          onToggle={toggleChecked}
          onRemove={removeItem}
          onAdd={(groupTitle, label) => addItem(groupTitle, label, "personal", personTab)}
        />
      )}
    </section>
  );
}

function PackingPersonView({
  trip,
  personId,
  groupTitles,
  pending,
  onToggle,
  onRemove,
  onAdd,
}: {
  trip: Trip;
  personId: string;
  groupTitles: string[];
  pending: boolean;
  onToggle: (item: PackingItem) => void;
  onRemove: (item: PackingItem) => void;
  onAdd: (groupTitle: string, label: string, assignedTo: string | null) => void;
}) {
  const groupsWithItems = trip.packing.groups
    .map((group) => ({ title: group.title, items: group.items.filter((item) => item.scope === "personal" && item.assignedTo === personId) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {groupsWithItems.length === 0 ? (
        <p className="packing-empty card">Noch nichts zugewiesen. Füge unten den ersten Punkt hinzu.</p>
      ) : (
        <div className="packing-grid">
          {groupsWithItems.map((group) => (
            <section className="card packing-group" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.items.map((item) => (
                  <label key={item.id} className={item.checked ? "packed" : ""}>
                    <input type="checkbox" checked={item.checked} onChange={() => onToggle(item)} disabled={pending} />
                    <i>{item.checked ? "✓" : ""}</i>
                    <span>{item.label}</span>
                    <button type="button" className="packing-remove" aria-label={`${item.label} entfernen`} onClick={() => onRemove(item)} disabled={pending}>×</button>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <PackingAddForm groupTitles={groupTitles} people={trip.packing.people} showAssignee={false} pending={pending} onAdd={onAdd} />
    </>
  );
}

function PackingSharedView({
  trip,
  groupTitles,
  pending,
  onToggle,
  onRemove,
  onAssign,
  onAdd,
}: {
  trip: Trip;
  groupTitles: string[];
  pending: boolean;
  onToggle: (item: PackingItem) => void;
  onRemove: (item: PackingItem) => void;
  onAssign: (item: PackingItem, personId: string | null) => void;
  onAdd: (groupTitle: string, label: string, assignedTo: string | null) => void;
}) {
  const groupsWithItems = trip.packing.groups
    .map((group) => ({ title: group.title, items: group.items.filter((item) => item.scope === "shared") }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {groupsWithItems.length === 0 ? (
        <p className="packing-empty card">Noch keine gemeinsamen Punkte auf der Liste.</p>
      ) : (
        <div className="packing-grid">
          {groupsWithItems.map((group) => (
            <section className="card packing-group packing-group-all" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.items.map((item) => (
                  <div key={item.id} className={item.checked ? "packing-all-row packed" : "packing-all-row"}>
                    <label>
                      <input type="checkbox" checked={item.checked} onChange={() => onToggle(item)} disabled={pending} />
                      <i>{item.checked ? "✓" : ""}</i>
                      <span>{item.label}</span>
                    </label>
                    <div className="assignee-chips">
                      {trip.packing.people.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          className={item.assignedTo === person.id ? "assignee-chip active" : "assignee-chip"}
                          title={person.name}
                          disabled={pending}
                          onClick={() => onAssign(item, item.assignedTo === person.id ? null : person.id)}
                        >
                          {initials(person.name)}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="packing-remove" aria-label={`${item.label} entfernen`} onClick={() => onRemove(item)} disabled={pending}>×</button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <PackingAddForm groupTitles={groupTitles} people={trip.packing.people} showAssignee pending={pending} onAdd={onAdd} />
    </>
  );
}

function PackingAddForm({
  groupTitles,
  people,
  showAssignee,
  pending,
  onAdd,
}: {
  groupTitles: string[];
  people: Trip["packing"]["people"];
  showAssignee: boolean;
  pending: boolean;
  onAdd: (groupTitle: string, label: string, assignedTo: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState(groupTitles[0] ?? "");
  const [assignee, setAssignee] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed || !group) return;
    onAdd(group, trimmed, showAssignee ? assignee || null : null);
    setLabel("");
  };

  return (
    <form className="packing-add card" onSubmit={submit}>
      <input type="text" placeholder="Neuer Punkt …" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} disabled={pending} />
      <select value={group} onChange={(event) => setGroup(event.target.value)} disabled={pending}>
        {groupTitles.map((title) => <option key={title} value={title}>{title}</option>)}
      </select>
      {showAssignee && (
        <select value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={pending}>
          <option value="">Niemand</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      )}
      <button type="submit" disabled={pending || !label.trim()}>+ Hinzufügen</button>
    </form>
  );
}

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function Documents({ trip }: { trip: Trip }) {
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="DOKUMENTE & INFOS" title="Wichtiges, wenn es darauf ankommt." copy="Dokumente, Kontakte und praktische Hinweise für unterwegs." />
      <div className="documents-layout">
        <div className="documents-grid">{trip.documents.map((doc) => <article className="card document-card" key={doc.title}><span>{doc.symbol}</span><div><h2>{doc.title}</h2><p>{doc.meta}</p></div><i className={doc.status === "Ausstehend" ? "waiting" : ""}>{doc.status}</i></article>)}</div>
        <aside className="card emergency-card">
          <div className="eyebrow light"><span /> IM NOTFALL</div>
          <h2>Gut zu wissen</h2>
          {trip.emergencyContacts.map((contact) => (
            <div key={contact.label}><span>{contact.label}</span><a href={`tel:${contact.phone.replace(/\s+/g, "")}`}>{contact.phone}</a></div>
          ))}
          <p>Medizinische Dokumente und Versicherungsnummern zusätzlich offline speichern.</p>
        </aside>
        <div className="card practical-card">
          <CardHeader kicker="Kurz notiert" title="Vor Ort" />
          <div className="fact-grid">
            {trip.practicalFacts.map((fact) => <span key={fact.label}><small>{fact.label}</small><b>{fact.value}</b></span>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function CardHeader({ kicker, title, action, onAction }: { kicker: string; title: string; action?: string; onAction?: () => void }) {
  return <header className="card-header"><div><span>{kicker}</span><h2>{title}</h2></div>{action && <button onClick={onAction}>{action} <b>→</b></button>}</header>;
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-intro"><div className="eyebrow"><span /> {eyebrow}</div><h1>{title}</h1><p>{copy}</p><div className="sample-badge">Beispieldaten · frei anpassbar</div></header>;
}
