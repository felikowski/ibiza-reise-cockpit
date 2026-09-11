/** Resolves a pasted Google Maps or Apple Maps link into place details, so
 * the Entdecken "add place" form can prefill itself instead of everything
 * being typed by hand. The Google path goes through the Places API (New)
 * for category/area/photo and requires GOOGLE_PLACES_API_KEY (the caller
 * decides how to react if it's unset, see server/index.ts); Apple Maps has
 * no equivalent lookup available here, so that path only reads what the
 * share link's own URL parameters carry (name, coordinates, address). */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Only these hosts (or their subdomains) are ever fetched — both the
 * pasted link and every redirect hop are checked against the relevant list
 * before the next request is made, so a crafted short link can't turn this
 * endpoint into an open proxy for arbitrary internal/external URLs. */
const GOOGLE_ALLOWED_HOSTS = ["goo.gl", "google.com", "google.de", "google.es", "google.at", "google.co.uk", "google.fr", "google.it"];
const APPLE_ALLOWED_HOSTS = ["apple.com", "maps.apple"];

function isAllowedHost(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((base) => host === base || host.endsWith(`.${base}`));
}

export class PlacesApiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export interface PlaceSuggestion {
  name: string;
  type: string;
  area: string;
  lat: number;
  lon: number;
  image: string | null;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Without a browser session, Google sometimes answers a Maps short link
 * with an EU cookie-consent interstitial (served from consent.google.com,
 * itself a google.com subdomain so it passes ALLOWED_HOSTS) instead of
 * redirecting straight to the place. It responds 200, not 3xx, so
 * resolveRedirect would otherwise stop there with nothing extractable.
 * This pre-accepted consent cookie makes Google skip that page. A full,
 * realistic browser header set also helps avoid Google routing the request
 * to a bot-check page instead of resolving it normally. */
const CONSENT_BYPASS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
  Cookie: "CONSENT=YES+cb.20240107-08-p0.de+FX+410",
};

/** Follows redirects one hop at a time (instead of letting fetch auto-follow
 * them) so every intermediate destination can be checked against
 * allowedHosts before it's requested. */
async function resolveRedirect(startUrl: string, allowedHosts: string[], headers: Record<string, string> = {}): Promise<string> {
  let current = startUrl;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const response = await fetchWithTimeout(current, { redirect: "manual", headers });
    response.body?.cancel().catch(() => {});
    if (response.status < 300 || response.status >= 400) {
      return current;
    }
    const location = response.headers.get("location");
    if (!location) return current;
    const next = new URL(location, current).toString();
    if (!isAllowedHost(new URL(next).hostname, allowedHosts)) {
      throw new PlacesApiError("Der Link verweist auf eine nicht unterstützte Adresse.", 400);
    }
    current = next;
  }
  return current;
}

/** For the "couldn't read place data" error: names where the redirect chain
 * actually ended (e.g. a still-unresolved consent.google.com hop, or a
 * Google bot-check page), so a failed attempt is a diagnosis instead of a
 * guess — without needing access to the server's own logs. */
function describeLandingSpot(url: string): string {
  try {
    const landed = new URL(url);
    return ` (gelandet auf: ${landed.hostname}${landed.pathname}${landed.search})`;
  } catch {
    return "";
  }
}

const COORD_PATTERN = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
const PLACE_NAME_PATTERN = /\/maps\/place\/([^/@]+)/;
const BARE_COORD_PATTERN = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

/** Older/short-link resolutions put the place in the URL path
 * (/maps/place/Name/@lat,lon); newer ones can instead land on a bare
 * "/maps" page with the place carried as a "q" or "query" search param
 * (either a name to search for, or "lat,lon" coordinates) — so both need
 * checking before giving up on a link. */
function extractLinkHints(url: string): { name?: string; lat?: number; lon?: number } {
  const coordMatch = url.match(COORD_PATTERN);
  const nameMatch = url.match(PLACE_NAME_PATTERN);
  let name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, " ")) : undefined;
  let lat = coordMatch ? Number(coordMatch[1]) : undefined;
  let lon = coordMatch ? Number(coordMatch[2]) : undefined;

  if (!name && (lat === undefined || lon === undefined)) {
    const params = new URL(url).searchParams;
    const query = params.get("query") ?? params.get("q");
    if (query) {
      const bareCoordMatch = query.match(BARE_COORD_PATTERN);
      if (bareCoordMatch) {
        lat = Number(bareCoordMatch[1]);
        lon = Number(bareCoordMatch[2]);
      } else {
        name = query;
      }
    }
  }

  return { name, lat, lon };
}

interface AddressComponent {
  longText?: string;
  types?: string[];
}

function pickArea(addressComponents: AddressComponent[] | undefined, formattedAddress: string | undefined): string {
  const priority = ["sublocality", "sublocality_level_1", "locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2"];
  for (const type of priority) {
    const match = addressComponents?.find((component) => component.types?.includes(type));
    if (match?.longText) return match.longText;
  }
  const parts = formattedAddress?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  return parts[1] ?? parts[0] ?? "";
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function downloadPlacePhoto(photoName: string): Promise<{ data: Buffer; contentType: string } | null> {
  const metaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${PLACES_API_KEY}`;
  const metaResponse = await fetchWithTimeout(metaUrl);
  if (!metaResponse.ok) return null;
  const meta = (await metaResponse.json()) as { photoUri?: string };
  if (!meta.photoUri) return null;

  const imageResponse = await fetchWithTimeout(meta.photoUri);
  if (!imageResponse.ok) return null;
  const contentType = imageResponse.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  const contentLength = Number(imageResponse.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PHOTO_BYTES) return null;

  const data = Buffer.from(await imageResponse.arrayBuffer());
  if (data.byteLength > MAX_PHOTO_BYTES) return null;
  return { data, contentType };
}

async function savePlacePhoto(photosDir: string, data: Buffer, contentType: string): Promise<string> {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? "jpg";
  const filename = `${randomUUID()}.${extension}`;
  await mkdir(photosDir, { recursive: true });
  await writeFile(path.join(photosDir, filename), data);
  return filename;
}

interface TextSearchPlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  photos?: { name: string }[];
}

export async function resolveGoogleMapsLink(rawUrl: string, photosDir: string, publicPhotoPath: string): Promise<PlaceSuggestion> {
  if (!PLACES_API_KEY) {
    throw new PlacesApiError("Google-Places-Anbindung ist nicht konfiguriert (GOOGLE_PLACES_API_KEY fehlt).", 503);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PlacesApiError("Das ist kein gültiger Link.", 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new PlacesApiError("Bitte einen Google-Maps-Link einfügen.", 400);
  }
  if (!isAllowedHost(parsed.hostname, GOOGLE_ALLOWED_HOSTS)) {
    throw new PlacesApiError("Bitte einen Google-Maps-Link einfügen.", 400);
  }

  const resolvedUrl = await resolveRedirect(rawUrl, GOOGLE_ALLOWED_HOSTS, CONSENT_BYPASS_HEADERS);
  const hints = extractLinkHints(resolvedUrl);

  if (!hints.name) {
    if (hints.lat !== undefined && hints.lon !== undefined) {
      // A bare pin-drop link has no business identity to look up — just
      // hand back the coordinates and let the rest be filled in by hand.
      return { name: "", type: "", area: "", lat: hints.lat, lon: hints.lon, image: null };
    }
    console.error("Google Maps link resolution landed on an unparsable page", { rawUrl, resolvedUrl });
    throw new PlacesApiError(`Aus diesem Link konnten keine Ortsdaten gelesen werden${describeLandingSpot(resolvedUrl)}. Bitte einen Link zu einem konkreten Ort verwenden (Maps → Teilen).`, 400);
  }

  const searchBody: Record<string, unknown> = {
    textQuery: hints.name,
    languageCode: "de",
    regionCode: "ES",
  };
  if (hints.lat !== undefined && hints.lon !== undefined) {
    searchBody.locationBias = { circle: { center: { latitude: hints.lat, longitude: hints.lon }, radius: 5000 } };
  }

  const searchResponse = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.addressComponents,places.location,places.primaryTypeDisplayName,places.photos",
    },
    body: JSON.stringify(searchBody),
  });

  if (!searchResponse.ok) {
    const details = await searchResponse.text().catch(() => "");
    console.error("Places Text Search failed", searchResponse.status, details);
    throw new PlacesApiError(`Google Places hat mit ${searchResponse.status} geantwortet.`, 502);
  }

  const searchResult = (await searchResponse.json()) as { places?: TextSearchPlace[] };
  const place = searchResult.places?.[0];
  if (!place) {
    throw new PlacesApiError("Kein Ort für diesen Link gefunden.", 404);
  }

  let image: string | null = null;
  const photoName = place.photos?.[0]?.name;
  if (photoName) {
    const photo = await downloadPlacePhoto(photoName);
    if (photo) {
      const filename = await savePlacePhoto(photosDir, photo.data, photo.contentType);
      image = `${publicPhotoPath}/${filename}`;
    }
  }

  return {
    name: place.displayName?.text ?? hints.name,
    type: place.primaryTypeDisplayName?.text ?? "",
    area: pickArea(place.addressComponents, place.formattedAddress),
    lat: place.location?.latitude ?? hints.lat ?? 0,
    lon: place.location?.longitude ?? hints.lon ?? 0,
    image,
  };
}

/** Apple Maps share links carry the place's name, coordinates and address
 * as plain URL parameters, unlike Google's opaque short links — so there's
 * no equivalent of the Places API lookup to call here, just this link's own
 * query string once redirects are followed. */
function extractAppleLinkHints(url: string): { name?: string; lat?: number; lon?: number; area?: string } {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return {};
  }

  const name = params.get("name") ?? params.get("q") ?? undefined;

  const coordinate = params.get("coordinate") ?? params.get("ll") ?? params.get("sll") ?? undefined;
  let lat: number | undefined;
  let lon: number | undefined;
  if (coordinate) {
    const [latPart, lonPart] = coordinate.split(",").map((part) => part.trim());
    const parsedLat = Number(latPart);
    const parsedLon = Number(lonPart);
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
      lat = parsedLat;
      lon = parsedLon;
    }
  }

  const address = params.get("address") ?? undefined;
  const addressParts = address?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  const area = addressParts[1] ?? addressParts[0];

  return { name, lat, lon, area };
}

export async function resolveAppleMapsLink(rawUrl: string): Promise<PlaceSuggestion> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PlacesApiError("Das ist kein gültiger Link.", 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new PlacesApiError("Bitte einen Apple-Karten-Link einfügen.", 400);
  }
  if (!isAllowedHost(parsed.hostname, APPLE_ALLOWED_HOSTS)) {
    throw new PlacesApiError("Bitte einen Apple-Karten-Link einfügen.", 400);
  }

  const resolvedUrl = await resolveRedirect(rawUrl, APPLE_ALLOWED_HOSTS);
  const hints = extractAppleLinkHints(resolvedUrl);

  if (!hints.name && (hints.lat === undefined || hints.lon === undefined)) {
    console.error("Apple Maps link resolution landed on an unparsable page", { rawUrl, resolvedUrl });
    throw new PlacesApiError(`Aus diesem Link konnten keine Ortsdaten gelesen werden${describeLandingSpot(resolvedUrl)}. Bitte einen Link zu einem konkreten Ort verwenden (Karten → Teilen).`, 400);
  }

  return {
    name: hints.name ?? "",
    type: "",
    area: hints.area ?? "",
    lat: hints.lat ?? 0,
    lon: hints.lon ?? 0,
    image: null,
  };
}
