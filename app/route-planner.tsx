"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Place } from "@/src/domain/trip";

export type TravelMode = "driving" | "walking" | "bicycling" | "transit";

export const DEFAULT_TRAVEL_MODE: TravelMode = "driving";

const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  driving: "Auto",
  walking: "Zu Fuß",
  bicycling: "Fahrrad",
  transit: "Öffentliche Verkehrsmittel",
};

const TRAVEL_MODES = Object.keys(TRAVEL_MODE_LABELS) as TravelMode[];

export type RoutePlace = Pick<Place, "id" | "name" | "area" | "lat" | "lon">;

function hasRouteCoords(place: RoutePlace): place is RoutePlace & { lat: number; lon: number } {
  return place.lat !== undefined && place.lon !== undefined;
}

/** Builds a Google Maps directions deep link: first stop is the origin, last
 * stop the destination, everything in between becomes a waypoint, in order.
 * Returns null when there aren't at least two stops with coordinates — a
 * route can't be expressed with fewer. */
export function buildGoogleMapsRouteUrl(places: RoutePlace[], travelMode: TravelMode): string | null {
  const stops = places.filter(hasRouteCoords);
  if (stops.length < 2) return null;

  // A raw "lat,lng" pair carries no name, so Google Maps labels that stop
  // "Markierter Standort" instead of the place — pass the name+area as a
  // text query instead, same as the single-place "In Google Maps öffnen"
  // link elsewhere, so every stop resolves to the actual place.
  const query = (place: RoutePlace) => encodeURIComponent(`${place.name}, ${place.area}, Ibiza`);
  const origin = query(stops[0]);
  const destination = query(stops[stops.length - 1]);
  const waypoints = stops.slice(1, -1);

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  if (waypoints.length > 0) {
    url += `&waypoints=${waypoints.map(query).join("|")}`;
  }
  url += `&travelmode=${travelMode}`;
  return url;
}

export function RouteModal({
  places,
  travelMode,
  onTravelModeChange,
  onReorder,
  onRemove,
  onClose,
}: {
  places: RoutePlace[];
  travelMode: TravelMode;
  onTravelModeChange: (mode: TravelMode) => void;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (placeId: string) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Drag-to-reorder via Pointer Events (not native HTML5 drag-and-drop, which
  // has no touch support): while a handle is held down, the item nearest the
  // pointer's vertical position becomes its new slot, live.
  useEffect(() => {
    if (!dragId) return;

    const handlePointerMove = (event: PointerEvent) => {
      let closestId: string | null = null;
      let closestIndex = -1;
      let closestDistance = Infinity;
      places.forEach((place, index) => {
        const el = itemRefs.current.get(place.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - event.clientY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = place.id;
          closestIndex = index;
        }
      });
      if (!closestId || closestIndex === -1) return;
      const currentIds = places.map((place) => place.id);
      const fromIndex = currentIds.indexOf(dragId);
      if (fromIndex === -1 || fromIndex === closestIndex) return;
      const next = [...currentIds];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(closestIndex, 0, moved);
      onReorder(next);
    };

    const stopDragging = () => setDragId(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
    // `places`/`onReorder` change on every reorder; resubscribing is cheap
    // and keeps the closure holding the current order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId, places]);

  const url = buildGoogleMapsRouteUrl(places, travelMode);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the link field
      // itself is still selectable and copyable by hand.
    }
  };

  // RouteModal is only ever mounted client-side (the person has to tap the
  // "Routenplaner" button first), so by the time this runs `document`
  // already exists — no effect/state indirection needed to detect that.
  if (typeof document === "undefined") return null;

  // Portal straight into <body>: this can end up nested under ancestors
  // that apply a transform/animation, which per spec turns that ancestor
  // into the containing block for position:fixed descendants — breaking
  // "fixed to the viewport" and leaving the modal stuck mid-page instead of
  // pinned on screen. Rendering outside the tree sidesteps that entirely.
  return createPortal(
    <div className="route-modal-overlay" onClick={onClose}>
      <div
        className="route-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Routenplaner"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="route-modal-header">
          <h3>Routenplaner</h3>
          <button type="button" className="route-modal-close" aria-label="Schließen" onClick={onClose}>×</button>
        </div>

        {places.length === 0 ? (
          <p className="route-empty">Noch keine Orte ausgewählt. Tippe in der Liste auf einen Ort, um ihn zur Route hinzuzufügen.</p>
        ) : (
          <ul className="route-list">
            {places.map((place, index) => (
              <li
                key={place.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(place.id, el);
                  else itemRefs.current.delete(place.id);
                }}
                className={`route-item${dragId === place.id ? " route-item-dragging" : ""}`}
              >
                <span className="route-item-index">{index + 1}</span>
                <span className="route-item-name">
                  {place.name}
                  <small>{place.area}</small>
                </span>
                <button
                  type="button"
                  className="route-item-handle"
                  aria-label={`${place.name} verschieben`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setDragId(place.id);
                  }}
                >
                  ⠿
                </button>
                <button
                  type="button"
                  className="route-item-remove"
                  aria-label={`${place.name} aus der Route entfernen`}
                  onClick={() => onRemove(place.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="route-mode-label">
          Verkehrsmittel
          <select
            className="route-mode-select"
            value={travelMode}
            onChange={(event) => onTravelModeChange(event.target.value as TravelMode)}
          >
            {TRAVEL_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {TRAVEL_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>

        {url ? (
          <>
            <div className="route-link-row">
              <input type="text" readOnly value={url} onFocus={(event) => event.target.select()} aria-label="Google-Maps-Routenlink" />
              <button type="button" className="route-copy" onClick={handleCopy}>{copied ? "Kopiert ✓" : "Kopieren"}</button>
            </div>
            <a className="route-open" href={url} target="_blank" rel="noopener noreferrer">Route in Google Maps öffnen ↗</a>
          </>
        ) : (
          <p className="route-hint">Füge mindestens zwei Orte mit Koordinaten hinzu, um eine Route zu erstellen.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
