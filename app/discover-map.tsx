"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { Place } from "@/src/domain/trip";
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

/** Places without real coordinates yet (older data predating this feature)
 * report lat/lon as undefined. The admin form's number inputs coerce an
 * empty field to 0 rather than leaving it unset, so (0, 0) — Null Island,
 * nowhere near Ibiza — doubles as "not set" here too. */
export function hasCoords(place: Place): place is Place & { lat: number; lon: number } {
  return typeof place.lat === "number" && typeof place.lon === "number" && !(place.lat === 0 && place.lon === 0);
}

export function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

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
      `<a href="${googleMapsUrl(place.lat, place.lon)}" target="_blank" rel="noopener noreferrer">In Google Maps öffnen ↗</a>`;
    L.marker([place.lat, place.lon], { icon }).addTo(layer).bindPopup(popup);
    bounds.extend([place.lat, place.lon]);
  }

  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
}

export default function DiscoverMap({ home, places }: { home: MapHome; places: Place[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then(({ default: L }) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([home.lat, home.lon], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;
      renderMarkers(map, layer, home, places);
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
