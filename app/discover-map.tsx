"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { Place } from "@/src/domain/trip";
import { hasCoords } from "@/src/domain/derive-trip";
import "leaflet/dist/leaflet.css";

export interface MapHome {
  lat: number;
  lon: number;
  title: string;
  subtitle: string;
}

const TYPE_COLORS: Record<string, string> = {
  Bar: "#edb84d",
  Essen: "#ec725e",
  Supermarkt: "#6b9db3",
  Strand: "#7fb3c9",
  Club: "#9483a3",
  Aussicht: "#d95845",
  Kultur: "#c79767",
  Höhle: "#789887",
};
const DEFAULT_PIN_COLOR = "#789887";

export function googleMapsUrl(place: Pick<Place, "name" | "area">): string {
  const query = `${place.name}, ${place.area}, Ibiza`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/** Draws the home + place markers and returns their combined bounds. Doesn't
 * touch the map's viewport itself — callers decide whether/when to fit it,
 * so switching a filter can swap pins without yanking the camera around. */
async function renderMarkers(map: LeafletMap, layer: LayerGroup, home: MapHome, places: Place[]) {
  const { default: L } = await import("leaflet");
  layer.clearLayers();

  const homeIcon = L.divIcon({
    className: "",
    html: '<span class="map-pin map-pin-home" aria-hidden="true">⌂</span>',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -26],
  });
  L.marker([home.lat, home.lon], { icon: homeIcon })
    .addTo(layer)
    .bindPopup(`<h3>${escapeHtml(home.title)}</h3><p class="popup-meta">${escapeHtml(home.subtitle)}</p>`);

  const bounds = L.latLngBounds([[home.lat, home.lon]]);

  for (const place of places) {
    if (!hasCoords(place)) continue;
    const color = TYPE_COLORS[place.type] ?? DEFAULT_PIN_COLOR;
    const icon = L.divIcon({
      className: "",
      html: `<span class="map-pin" style="--pin-color:${color}" aria-hidden="true"></span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -22],
    });
    const popup =
      `<h3>${escapeHtml(place.name)}</h3><p class="popup-meta">${escapeHtml(place.type)} · ${escapeHtml(place.area)}</p>` +
      (place.note ? `<p>${escapeHtml(place.note)}</p>` : "") +
      `<a href="${googleMapsUrl(place)}" target="_blank" rel="noopener noreferrer">In Google Maps öffnen ↗</a>`;
    L.marker([place.lat, place.lon], { icon }).addTo(layer).bindPopup(popup);
    bounds.extend([place.lat, place.lon]);
  }

  return bounds;
}

export default function DiscoverMap({ home, places }: { home: MapHome; places: Place[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then(async ({ default: L }) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([home.lat, home.lon], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;
      const bounds = await renderMarkers(map, layer, home, places);
      if (cancelled) return;
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Map is created once on mount; updates below react to prop changes instead of recreating it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    renderMarkers(mapRef.current, layerRef.current, home, places);
  }, [home, places]);

  return (
    <div
      className="map-card card map-live"
      ref={containerRef}
      role="img"
      aria-label={`Karte mit Orten rund um ${home.title}`}
    />
  );
}
