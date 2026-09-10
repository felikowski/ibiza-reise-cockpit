"use client";

import { useState } from "react";
import type { DayTone, ItineraryDay, PackingItem, Place, ShoppingItem, TimelineEntry, Trip } from "@/src/domain/trip";
import {
  budgetGrandTotal,
  confirmedBookings,
  countdownDays,
  documentsReadiness,
  formatEuroExact,
  hasCoords,
  heroDateRangeLabel,
  nearbyPlaces,
  nightsBetween,
  packingTotals,
  perPersonShare,
  placeTypes,
  readinessPercent,
  shoppingTotals,
  sortedTimeline,
  berlinComparisonDays,
  tripDates,
} from "@/src/domain/derive-trip";
import { parseISODate } from "@/src/domain/dates";
import type { DailyWeather } from "@/src/domain/open-meteo";
import { describeWeatherCode } from "@/src/domain/weather-codes";
import DiscoverMap, { googleMapsUrl } from "./discover-map";
import type { TabId, WeatherState } from "./app-shell";

async function submitTripRequest(url: string, method: string, body?: unknown): Promise<Trip> {
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
  return submitTripRequest("/api/packing/items", "POST", { groupTitle, label, scope, assignedTo });
}

function patchPackingItem(itemId: string, patch: { checked?: boolean; assignedTo?: string | null }): Promise<Trip> {
  return submitTripRequest(`/api/packing/items/${itemId}`, "PATCH", patch);
}

function removePackingItem(itemId: string): Promise<Trip> {
  return submitTripRequest(`/api/packing/items/${itemId}`, "DELETE");
}

function addShoppingItem(categoryTitle: string, label: string): Promise<Trip> {
  return submitTripRequest("/api/shopping/items", "POST", { categoryTitle, label });
}

function patchShoppingItem(itemId: string, patch: { checked: boolean }): Promise<Trip> {
  return submitTripRequest(`/api/shopping/items/${itemId}`, "PATCH", patch);
}

function removeShoppingItem(itemId: string): Promise<Trip> {
  return submitTripRequest(`/api/shopping/items/${itemId}`, "DELETE");
}

interface ItineraryDayFields {
  weekday: string;
  dateLabel: string;
  title: string;
  note: string;
  tone: DayTone;
}

interface TimelineEntryFields {
  time: string;
  title: string;
  note: string;
  highlight: boolean;
}

function addItineraryDay(fields: ItineraryDayFields): Promise<Trip> {
  return submitTripRequest("/api/itinerary/days", "POST", fields);
}

function patchItineraryDay(dayId: string, patch: Partial<ItineraryDayFields>): Promise<Trip> {
  return submitTripRequest(`/api/itinerary/days/${dayId}`, "PATCH", patch);
}

function removeItineraryDay(dayId: string): Promise<Trip> {
  return submitTripRequest(`/api/itinerary/days/${dayId}`, "DELETE");
}

function addTimelineEntry(dayId: string, fields: TimelineEntryFields): Promise<Trip> {
  return submitTripRequest(`/api/itinerary/days/${dayId}/timeline`, "POST", fields);
}

function patchTimelineEntry(entryId: string, patch: Partial<TimelineEntryFields>): Promise<Trip> {
  return submitTripRequest(`/api/itinerary/timeline/${entryId}`, "PATCH", patch);
}

function removeTimelineEntry(entryId: string): Promise<Trip> {
  return submitTripRequest(`/api/itinerary/timeline/${entryId}`, "DELETE");
}

interface PlaceFields {
  name: string;
  type: string;
  area: string;
  note: string;
  color: string;
  lat: number | null;
  lon: number | null;
  image: string | null;
}

function addPlace(fields: PlaceFields): Promise<Trip> {
  return submitTripRequest("/api/places", "POST", fields);
}

function patchPlace(placeId: string, patch: Partial<PlaceFields>): Promise<Trip> {
  return submitTripRequest(`/api/places/${placeId}`, "PATCH", patch);
}

function removePlace(placeId: string): Promise<Trip> {
  return submitTripRequest(`/api/places/${placeId}`, "DELETE");
}

interface PlaceLinkSuggestion {
  name: string;
  type: string;
  area: string;
  lat: number;
  lon: number;
  image: string | null;
}

async function resolvePlaceLink(url: string): Promise<PlaceLinkSuggestion> {
  const response = await fetch("/api/places/resolve-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Server antwortete mit ${response.status}`);
  }
  return payload.suggestion as PlaceLinkSuggestion;
}

export function Overview({
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
  const budgetTotal = budgetGrandTotal(trip.budget);
  const bookings = confirmedBookings(trip);
  const docs = documentsReadiness(trip.documents);
  const packingStats = packingTotals(trip.packing);
  const readiness = readinessPercent(trip);
  const outbound = trip.flights.outbound;

  return (
    <section className="page page-overview">
      <div className="hero">
        <div className="godless-sticker" aria-hidden="true"><i>💊</i><i>🍺</i></div>
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
          <p>Erst der Countdown.<br />Dann das kalte Bier.</p>
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
          <CardHeader kicker="Reisekasse" title="Wer zahlt was?" action="Details" onAction={() => onNavigate("budget")} />
          <div className="budget-total"><strong>{formatEuroExact(budgetTotal)}</strong><span>Flug, Mietwagen &amp; Unterkunft zusammen</span></div>
          <div className="budget-labels"><span>Pro Person</span><b>{formatEuroExact(perPersonShare(budgetTotal))}</b></div>
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

export function Weather({ trip, weather }: { trip: Trip; weather: WeatherState }) {
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
          <CardHeader
            kicker={trip.meta.destinationCity}
            title="Reisewetter, Tag für Tag"
            action="wetter.com"
            href="https://www.wetter.com/wetter_aktuell/wettervorhersage/16_tagesvorhersage/spanien/ibiza-stadt/ES0BA0021.html"
          />
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
                  <p className="weather-day-sun"><span>☀ {day.sunrise}</span><span>☾ {day.sunset}</span></p>
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

const DAY_TONE_OPTIONS: { value: DayTone; label: string }[] = [
  { value: "sun", label: "Sonne" },
  { value: "water", label: "Wasser" },
  { value: "peach", label: "Pfirsich" },
  { value: "sage", label: "Salbei" },
  { value: "stone", label: "Stein" },
];

const NEW_DAY_DRAFT: ItineraryDay = { id: "", weekday: "", dateLabel: "", title: "", note: "", tone: "sun", timeline: [] };

export function TravelPlan({ trip, onTripChange }: { trip: Trip; onTripChange: (trip: Trip) => void }) {
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState(false);
  const [addingDay, setAddingDay] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [addingEntry, setAddingEntry] = useState(false);

  const dayIndex = Math.min(selected, trip.itineraryDays.length - 1);
  const day = trip.itineraryDays[dayIndex];

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

  const selectDay = (index: number) => {
    setSelected(index);
    setEditingDay(false);
    setAddingDay(false);
    setEditingEntryId(null);
    setAddingEntry(false);
  };

  const handleAddDay = (fields: ItineraryDayFields) =>
    run(async () => {
      const updated = await addItineraryDay(fields);
      setSelected(updated.itineraryDays.length - 1);
      setAddingDay(false);
      return updated;
    });

  const handleRemoveDay = (dayId: string) =>
    run(async () => {
      const updated = await removeItineraryDay(dayId);
      setSelected((current) => Math.min(current, updated.itineraryDays.length - 1));
      return updated;
    });

  const handleSaveDay = (dayId: string, patch: ItineraryDayFields) =>
    run(async () => {
      const updated = await patchItineraryDay(dayId, patch);
      setEditingDay(false);
      return updated;
    });

  const handleAddEntry = (dayId: string, fields: TimelineEntryFields) =>
    run(async () => {
      const updated = await addTimelineEntry(dayId, fields);
      setAddingEntry(false);
      return updated;
    });

  const handleSaveEntry = (entryId: string, patch: TimelineEntryFields) =>
    run(async () => {
      const updated = await patchTimelineEntry(entryId, patch);
      setEditingEntryId(null);
      return updated;
    });

  const handleRemoveEntry = (entryId: string) => run(() => removeTimelineEntry(entryId));

  return (
    <section className="page inner-page">
      <PageIntro eyebrow="REISEPLAN" title="Genau dein Tempo." copy="Alle Etappen auf einen Blick — und direkt hier anpassbar." />
      <div className="plan-layout">
        <div className="day-selector" role="tablist" aria-label="Reisetage">
          {trip.itineraryDays.map((item, index) => (
            <button key={item.id} className={dayIndex === index ? "selected" : ""} onClick={() => selectDay(index)} role="tab" aria-selected={dayIndex === index}>
              <span>{item.weekday || "–"}</span><b>{item.dateLabel.split(" ")[0] || "–"}</b><small>{item.dateLabel.split(" ")[1] ?? ""}</small>
            </button>
          ))}
          <button type="button" className="day-add" onClick={() => { setAddingDay(true); setEditingDay(false); setEditingEntryId(null); setAddingEntry(false); }} disabled={pending} aria-label="Tag hinzufügen">+</button>
        </div>

        {error && <p className="packing-error">{error}</p>}

        <div className="card day-detail">
          {addingDay ? (
            <>
              <h2 className="day-edit-heading">Neuer Reisetag</h2>
              <DayEditForm day={NEW_DAY_DRAFT} pending={pending} submitLabel="Tag anlegen" onSave={handleAddDay} onCancel={() => setAddingDay(false)} />
            </>
          ) : (
            <>
              {editingDay ? (
                <DayEditForm day={day} pending={pending} submitLabel="Speichern" onSave={(patch) => handleSaveDay(day.id, patch)} onCancel={() => setEditingDay(false)} />
              ) : (
                <div className="day-detail-head">
                  <div><span>{day.dateLabel} · Tag {dayIndex + 1}</span><h2>{day.title}</h2><p>{day.note}</p></div>
                  <div className="day-detail-actions">
                    <i className={`large-day-dot ${day.tone}`} />
                    <button type="button" className="day-edit-btn" onClick={() => setEditingDay(true)} disabled={pending}>Bearbeiten</button>
                    {trip.itineraryDays.length > 1 && (
                      <button type="button" className="day-remove-btn" onClick={() => handleRemoveDay(day.id)} disabled={pending}>Tag entfernen</button>
                    )}
                  </div>
                </div>
              )}

              <div className="timeline">
                {sortedTimeline(day.timeline).map((entry) =>
                  editingEntryId === entry.id ? (
                    <TimelineEntryEditForm
                      key={entry.id}
                      entry={entry}
                      pending={pending}
                      onSave={(patch) => handleSaveEntry(entry.id, patch)}
                      onCancel={() => setEditingEntryId(null)}
                    />
                  ) : (
                    <div className="timeline-row" key={entry.id}>
                      <time>{entry.time}</time>
                      <i className={entry.highlight ? "accent" : ""} />
                      <div><b>{entry.title}</b><span>{entry.note}</span></div>
                      <div className="timeline-row-actions">
                        {entry.highlight && <em>Highlight</em>}
                        <button type="button" className="timeline-edit" aria-label={`${entry.title} bearbeiten`} onClick={() => setEditingEntryId(entry.id)} disabled={pending}>✎</button>
                        <button type="button" className="packing-remove" aria-label={`${entry.title} entfernen`} onClick={() => handleRemoveEntry(entry.id)} disabled={pending}>×</button>
                      </div>
                    </div>
                  ),
                )}
                {day.timeline.length === 0 && !addingEntry && <p className="timeline-empty">Noch kein Tagesablauf für diesen Tag.</p>}
              </div>

              {addingEntry ? (
                <TimelineAddForm pending={pending} onAdd={(fields) => handleAddEntry(day.id, fields)} onCancel={() => setAddingEntry(false)} />
              ) : (
                <button type="button" className="timeline-add-toggle" onClick={() => setAddingEntry(true)} disabled={pending}>+ Eintrag hinzufügen</button>
              )}
            </>
          )}
        </div>

        <aside className="card plan-note">
          <span className="note-icon">☼</span>
          <h3>Raum für Spontanes</h3>
          <div className="meme-drake">
            <div className="meme-row reject"><span className="meme-emoji">🙅‍♂️</span><p>Minutentakt mit Uhrzeit für jede Bucht</p></div>
            <div className="meme-row approve"><span className="meme-emoji">😎</span><p>Auto volltanken, Kühlbox laden, Rest ergibt sich</p></div>
          </div>
          <div><span>Reservierungen</span><b>2 offen</b></div>
          <div><span>Freie Zeit</span><b>3 halbe Tage</b></div>
        </aside>
      </div>
    </section>
  );
}

function DayEditForm({
  day,
  pending,
  submitLabel,
  onSave,
  onCancel,
}: {
  day: ItineraryDay;
  pending: boolean;
  submitLabel: string;
  onSave: (fields: ItineraryDayFields) => void;
  onCancel: () => void;
}) {
  const [weekday, setWeekday] = useState(day.weekday);
  const [dateLabel, setDateLabel] = useState(day.dateLabel);
  const [title, setTitle] = useState(day.title);
  const [note, setNote] = useState(day.note);
  const [tone, setTone] = useState<DayTone>(day.tone);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!weekday.trim() || !dateLabel.trim() || !title.trim()) return;
    onSave({ weekday: weekday.trim(), dateLabel: dateLabel.trim(), title: title.trim(), note, tone });
  };

  return (
    <form className="day-edit-form" onSubmit={submit}>
      <div className="day-edit-grid">
        <label>Wochentag<input type="text" value={weekday} onChange={(event) => setWeekday(event.target.value)} maxLength={12} disabled={pending} /></label>
        <label>Datum-Label<input type="text" value={dateLabel} onChange={(event) => setDateLabel(event.target.value)} maxLength={24} disabled={pending} /></label>
        <label>Farbton
          <select value={tone} onChange={(event) => setTone(event.target.value as DayTone)} disabled={pending}>
            {DAY_TONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="day-edit-full">Titel<input type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} disabled={pending} /></label>
        <label className="day-edit-full">Notiz<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} disabled={pending} /></label>
      </div>
      <div className="day-edit-actions">
        <button type="button" className="day-edit-btn secondary" onClick={onCancel} disabled={pending}>Abbrechen</button>
        <button type="submit" className="day-edit-btn" disabled={pending || !weekday.trim() || !dateLabel.trim() || !title.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}

function TimelineEntryEditForm({
  entry,
  pending,
  onSave,
  onCancel,
}: {
  entry: TimelineEntry;
  pending: boolean;
  onSave: (fields: TimelineEntryFields) => void;
  onCancel: () => void;
}) {
  const [time, setTime] = useState(entry.time);
  const [title, setTitle] = useState(entry.title);
  const [note, setNote] = useState(entry.note);
  const [highlight, setHighlight] = useState(entry.highlight);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!time.trim() || !title.trim()) return;
    onSave({ time: time.trim(), title: title.trim(), note, highlight });
  };

  return (
    <form className="timeline-edit-form" onSubmit={submit}>
      <input type="text" placeholder="Uhrzeit" value={time} onChange={(event) => setTime(event.target.value)} maxLength={16} disabled={pending} />
      <input type="text" placeholder="Titel" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} disabled={pending} />
      <input type="text" placeholder="Notiz" value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} disabled={pending} />
      <label className="timeline-highlight"><input type="checkbox" checked={highlight} onChange={(event) => setHighlight(event.target.checked)} disabled={pending} /> Highlight</label>
      <div className="timeline-edit-actions">
        <button type="button" className="day-edit-btn secondary" onClick={onCancel} disabled={pending}>Abbrechen</button>
        <button type="submit" className="day-edit-btn" disabled={pending || !time.trim() || !title.trim()}>Speichern</button>
      </div>
    </form>
  );
}

function TimelineAddForm({
  pending,
  onAdd,
  onCancel,
}: {
  pending: boolean;
  onAdd: (fields: TimelineEntryFields) => void;
  onCancel: () => void;
}) {
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [highlight, setHighlight] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTime = time.trim();
    const trimmedTitle = title.trim();
    if (!trimmedTime || !trimmedTitle) return;
    onAdd({ time: trimmedTime, title: trimmedTitle, note, highlight });
    setTime("");
    setTitle("");
    setNote("");
    setHighlight(false);
  };

  return (
    <form className="timeline-edit-form" onSubmit={submit}>
      <input type="text" placeholder="Uhrzeit" value={time} onChange={(event) => setTime(event.target.value)} maxLength={16} disabled={pending} />
      <input type="text" placeholder="Titel" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} disabled={pending} />
      <input type="text" placeholder="Notiz" value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} disabled={pending} />
      <label className="timeline-highlight"><input type="checkbox" checked={highlight} onChange={(event) => setHighlight(event.target.checked)} disabled={pending} /> Highlight</label>
      <div className="timeline-edit-actions">
        <button type="button" className="day-edit-btn secondary" onClick={onCancel} disabled={pending}>Abbrechen</button>
        <button type="submit" className="day-edit-btn" disabled={pending || !time.trim() || !title.trim()}>+ Hinzufügen</button>
      </div>
    </form>
  );
}

export function Bookings({ trip, copied, onCopy }: { trip: Trip; copied: string | null; onCopy: (reference: string) => void }) {
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

const PLACE_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "peach", label: "Pfirsich" },
  { value: "sage", label: "Salbei" },
  { value: "lavender", label: "Lavendel" },
  { value: "sky", label: "Himmel" },
  { value: "sand", label: "Sand" },
  { value: "aqua", label: "Aqua" },
];

const NEW_PLACE_DRAFT: Place = { id: "", name: "", type: "", area: "", note: "", color: PLACE_COLOR_OPTIONS[0].value };

export function Discover({ trip, onTripChange }: { trip: Trip; onTripChange: (trip: Trip) => void }) {
  const [filter, setFilter] = useState("Alle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const filterOptions = ["Alle", NEARBY_FILTER, ...placeTypes(trip).slice(1)];
  const visible =
    filter === "Alle" ? trip.places : filter === NEARBY_FILTER ? nearbyPlaces(trip) : trip.places.filter((place) => place.type === filter);
  const home = {
    lat: trip.meta.destinationLat,
    lon: trip.meta.destinationLon,
    title: trip.accommodation.name,
    subtitle: `Eure Finca · ${trip.accommodation.area}`,
  };

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

  const handleAdd = (fields: PlaceFields) =>
    run(async () => {
      const updated = await addPlace(fields);
      setAdding(false);
      setFilter("Alle");
      return updated;
    });

  const handleSave = (placeId: string, fields: PlaceFields) =>
    run(async () => {
      const updated = await patchPlace(placeId, fields);
      setEditingId(null);
      return updated;
    });

  const handleRemove = (placeId: string) => run(() => removePlace(placeId));

  return (
    <section className="page inner-page">
      <PageIntro eyebrow="ENTDECKEN" title="Buchten, Bars, Aussichtspunkte." copy="Deine Merkliste für Buchten, Dörfer, gutes Essen und die besten Aussichten." />
      <div className="filter-row">{filterOptions.map((item) => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "active" : ""}>{item}</button>)}</div>
      {error && <p className="packing-error">{error}</p>}
      <div className="places-layout">
        <DiscoverMap home={home} places={visible} />
        <div className="place-grid">
          {visible.map((place, index) =>
            editingId === place.id ? (
              <PlaceEditForm
                key={place.id}
                place={place}
                pending={pending}
                submitLabel="Speichern"
                onSave={(fields) => handleSave(place.id, fields)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <article className="card place-card" key={place.id}>
                {place.image ? (
                  <img className="place-photo" src={place.image} alt="" loading="lazy" />
                ) : (
                  <span className={`place-color ${place.color}`}>{String(index + 1).padStart(2, "0")}</span>
                )}
                <div className="place-card-body">
                  <div><small>{place.type} · {place.area}</small><h2>{place.name}</h2><p>{place.note}</p></div>
                  <div className="place-card-actions">
                    {hasCoords(place) ? (
                      <a className="place-open" href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer" aria-label={`${place.name} in Google Maps öffnen`}>↗</a>
                    ) : (
                      <span className="place-open place-open-disabled" aria-hidden="true">↗</span>
                    )}
                    <button
                      type="button"
                      className="place-edit"
                      aria-label={`${place.name} bearbeiten`}
                      onClick={() => { setEditingId(place.id); setAdding(false); }}
                      disabled={pending}
                    >
                      ✎
                    </button>
                    <button type="button" className="packing-remove" aria-label={`${place.name} entfernen`} onClick={() => handleRemove(place.id)} disabled={pending}>×</button>
                  </div>
                </div>
              </article>
            ),
          )}
          {adding ? (
            <PlaceEditForm
              place={NEW_PLACE_DRAFT}
              pending={pending}
              submitLabel="Ort anlegen"
              heading="Neuer Ort"
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" className="place-add-toggle" onClick={() => { setAdding(true); setEditingId(null); }} disabled={pending}>+ Ort hinzufügen</button>
          )}
        </div>
      </div>
    </section>
  );
}

function PlaceEditForm({
  place,
  pending,
  submitLabel,
  heading,
  onSave,
  onCancel,
}: {
  place: Place;
  pending: boolean;
  submitLabel: string;
  heading?: string;
  onSave: (fields: PlaceFields) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(place.name);
  const [type, setType] = useState(place.type);
  const [area, setArea] = useState(place.area);
  const [note, setNote] = useState(place.note);
  const [color, setColor] = useState(place.color || PLACE_COLOR_OPTIONS[0].value);
  const [lat, setLat] = useState(place.lat !== undefined ? String(place.lat) : "");
  const [lon, setLon] = useState(place.lon !== undefined ? String(place.lon) : "");
  const [image, setImage] = useState(place.image ?? "");
  const [mapsLink, setMapsLink] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const handleResolve = async () => {
    const trimmedLink = mapsLink.trim();
    if (!trimmedLink) return;
    setResolving(true);
    setResolveError(null);
    try {
      const suggestion = await resolvePlaceLink(trimmedLink);
      if (suggestion.name) setName(suggestion.name);
      if (suggestion.type) setType(suggestion.type);
      if (suggestion.area) setArea(suggestion.area);
      setLat(String(suggestion.lat));
      setLon(String(suggestion.lon));
      if (suggestion.image) setImage(suggestion.image);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setResolving(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !type.trim() || !area.trim()) return;
    const parsedLat = lat.trim() ? Number(lat) : null;
    const parsedLon = lon.trim() ? Number(lon) : null;
    if ((lat.trim() && Number.isNaN(parsedLat)) || (lon.trim() && Number.isNaN(parsedLon))) return;
    onSave({
      name: name.trim(),
      type: type.trim(),
      area: area.trim(),
      note,
      color,
      lat: parsedLat,
      lon: parsedLon,
      image: image.trim() ? image.trim() : null,
    });
  };

  return (
    <form className="card place-edit-form" onSubmit={submit}>
      {heading && <h2 className="day-edit-heading">{heading}</h2>}
      <div className="place-link-row">
        <input
          type="url"
          placeholder="Google-Maps-Link einfügen …"
          value={mapsLink}
          onChange={(event) => setMapsLink(event.target.value)}
          disabled={pending || resolving}
        />
        <button type="button" className="day-edit-btn secondary" onClick={handleResolve} disabled={pending || resolving || !mapsLink.trim()}>
          {resolving ? "Lädt …" : "Angaben laden"}
        </button>
      </div>
      {resolveError && <p className="packing-error">{resolveError}</p>}
      <div className="day-edit-grid">
        <label>Name<input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} disabled={pending} /></label>
        <label>Kategorie<input type="text" value={type} onChange={(event) => setType(event.target.value)} maxLength={40} placeholder="z. B. Bar, Strand …" disabled={pending} /></label>
        <label>Gebiet<input type="text" value={area} onChange={(event) => setArea(event.target.value)} maxLength={60} disabled={pending} /></label>
        <label>Farbe
          <select value={color} onChange={(event) => setColor(event.target.value)} disabled={pending}>
            {PLACE_COLOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Breitengrad<input type="number" step="any" value={lat} onChange={(event) => setLat(event.target.value)} placeholder="optional" disabled={pending} /></label>
        <label>Längengrad<input type="number" step="any" value={lon} onChange={(event) => setLon(event.target.value)} placeholder="optional" disabled={pending} /></label>
        <label className="day-edit-full">Bild-URL<input type="text" value={image} onChange={(event) => setImage(event.target.value)} placeholder="optional" disabled={pending} /></label>
        <label className="day-edit-full">Notiz<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} disabled={pending} /></label>
      </div>
      <div className="day-edit-actions">
        <button type="button" className="day-edit-btn secondary" onClick={onCancel} disabled={pending}>Abbrechen</button>
        <button type="submit" className="day-edit-btn" disabled={pending || !name.trim() || !type.trim() || !area.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}

export function Budget({ trip }: { trip: Trip }) {
  const grandTotal = budgetGrandTotal(trip.budget);
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="BUDGET" title="Wer zahlt was?" copy="Flug, Mietwagen und Unterkunft, aufgeteilt auf alle drei Reisenden." />
      <div className="cost-split-grid">
        {trip.budget.categories.map((category) => (
          <div className="card cost-split-card" key={category.name}>
            <span className={category.color}>{category.name}</span>
            <strong>{formatEuroExact(category.amount)}</strong>
            <div><span>Pro Person</span><b>{formatEuroExact(perPersonShare(category.amount))}</b></div>
          </div>
        ))}
        <div className="card cost-split-total">
          <span>Gesamt</span>
          <strong>{formatEuroExact(grandTotal)}</strong>
          <div><span>Pro Person</span><b>{formatEuroExact(perPersonShare(grandTotal))}</b></div>
        </div>
      </div>
    </section>
  );
}

const SHARED_TAB_ID = "shared";

export function Packing({ trip, onTripChange }: { trip: Trip; onTripChange: (trip: Trip) => void }) {
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

export function Shopping({ trip, onTripChange }: { trip: Trip; onTripChange: (trip: Trip) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shoppingStats = shoppingTotals(trip.shopping);
  const categoryTitles = trip.shopping.categories.map((category) => category.title);
  const categoriesWithItems = trip.shopping.categories.filter((category) => category.items.length > 0);

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

  const toggleChecked = (item: ShoppingItem) => run(() => patchShoppingItem(item.id, { checked: !item.checked }));
  const removeItem = (item: ShoppingItem) => run(() => removeShoppingItem(item.id));
  const addItem = (categoryTitle: string, label: string) => run(() => addShoppingItem(categoryTitle, label));

  return (
    <section className="page inner-page">
      <PageIntro eyebrow="EINKAUFSLISTE" title="Alles im Wagen, nichts vergessen." copy="Der gemeinsame Großeinkauf für die Finca — sortiert nach Abteilung." />
      <div className="packing-head card">
        <div className="packing-ring" style={{ "--progress": `${shoppingStats.percent * 3.6}deg` } as React.CSSProperties}>
          <span>{shoppingStats.percent}<small>%</small></span>
        </div>
        <div>
          <span>Dein Fortschritt</span>
          <h2>{shoppingStats.checkedCount} von {shoppingStats.total} im Wagen</h2>
          <p>{shoppingStats.total - shoppingStats.checkedCount === 0 ? "Fertig — ab zur Kasse." : `Noch ${shoppingStats.total - shoppingStats.checkedCount} Dinge auf der Liste.`}</p>
        </div>
      </div>

      {error && <p className="packing-error">{error}</p>}

      {categoriesWithItems.length === 0 ? (
        <p className="packing-empty card">Noch nichts auf der Liste. Füge unten den ersten Punkt hinzu.</p>
      ) : (
        <div className="packing-grid">
          {categoriesWithItems.map((category) => (
            <section className="card packing-group" key={category.title}>
              <h2>{category.title}</h2>
              <div>
                {category.items.map((item) => (
                  <label key={item.id} className={item.checked ? "packed" : ""}>
                    <input type="checkbox" checked={item.checked} onChange={() => toggleChecked(item)} disabled={pending} />
                    <i>{item.checked ? "✓" : ""}</i>
                    <span>{item.label}</span>
                    <button type="button" className="packing-remove" aria-label={`${item.label} entfernen`} onClick={() => removeItem(item)} disabled={pending}>×</button>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ShoppingAddForm categoryTitles={categoryTitles} pending={pending} onAdd={addItem} />
    </section>
  );
}

function ShoppingAddForm({
  categoryTitles,
  pending,
  onAdd,
}: {
  categoryTitles: string[];
  pending: boolean;
  onAdd: (categoryTitle: string, label: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(categoryTitles[0] ?? "");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed || !category) return;
    onAdd(category, trimmed);
    setLabel("");
  };

  return (
    <form className="packing-add card" onSubmit={submit}>
      <input type="text" placeholder="Neuer Punkt …" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} disabled={pending} />
      <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={pending}>
        {categoryTitles.map((title) => <option key={title} value={title}>{title}</option>)}
      </select>
      <button type="submit" disabled={pending || !label.trim()}>+ Hinzufügen</button>
    </form>
  );
}

export function Documents({ trip }: { trip: Trip }) {
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

function CardHeader({
  kicker,
  title,
  action,
  onAction,
  href,
}: {
  kicker: string;
  title: string;
  action?: string;
  onAction?: () => void;
  href?: string;
}) {
  return (
    <header className="card-header">
      <div><span>{kicker}</span><h2>{title}</h2></div>
      {action && (
        href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">{action} <b>↗</b></a>
        ) : (
          <button onClick={onAction}>{action} <b>→</b></button>
        )
      )}
    </header>
  );
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-intro"><div className="eyebrow"><span /> {eyebrow}</div><h1>{title}</h1><p>{copy}</p><div className="sample-badge">Beispieldaten · frei anpassbar</div></header>;
}
