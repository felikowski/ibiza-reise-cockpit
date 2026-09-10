/** Resolves a pasted Google Maps link into place details (name, category,
 * area, coordinates, photo) via the Places API (New), so the Entdecken
 * "add place" form can prefill itself instead of everything being typed by
 * hand. Requires GOOGLE_PLACES_API_KEY; the caller decides how to react if
 * it's unset (see server/index.ts). */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Only these hosts (or their subdomains) are ever fetched — both the
 * pasted link and every redirect hop are checked against this list before
 * the next request is made, so a crafted short link can't turn this
 * endpoint into an open proxy for arbitrary internal/external URLs. */
const ALLOWED_HOSTS = ["goo.gl", "google.com", "google.de", "google.es", "google.at", "google.co.uk", "google.fr", "google.it"];

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
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

/** Follows redirects one hop at a time (instead of letting fetch auto-follow
 * them) so every intermediate destination can be checked against
 * ALLOWED_HOSTS before it's requested. */
async function resolveRedirect(startUrl: string): Promise<string> {
  let current = startUrl;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const response = await fetchWithTimeout(current, { redirect: "manual" });
    response.body?.cancel().catch(() => {});
    if (response.status < 300 || response.status >= 400) {
      return current;
    }
    const location = response.headers.get("location");
    if (!location) return current;
    const next = new URL(location, current).toString();
    if (!isAllowedHost(new URL(next).hostname)) {
      throw new PlacesApiError("Der Link verweist auf eine nicht unterstützte Adresse.", 400);
    }
    current = next;
  }
  return current;
}

const COORD_PATTERN = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
const PLACE_NAME_PATTERN = /\/maps\/place\/([^/@]+)/;

function extractLinkHints(url: string): { name?: string; lat?: number; lon?: number } {
  const coordMatch = url.match(COORD_PATTERN);
  const nameMatch = url.match(PLACE_NAME_PATTERN);
  return {
    name: nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, " ")) : undefined,
    lat: coordMatch ? Number(coordMatch[1]) : undefined,
    lon: coordMatch ? Number(coordMatch[2]) : undefined,
  };
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
  if (!isAllowedHost(parsed.hostname)) {
    throw new PlacesApiError("Bitte einen Google-Maps-Link einfügen.", 400);
  }

  const resolvedUrl = await resolveRedirect(rawUrl);
  const hints = extractLinkHints(resolvedUrl);

  if (!hints.name) {
    if (hints.lat !== undefined && hints.lon !== undefined) {
      // A bare pin-drop link has no business identity to look up — just
      // hand back the coordinates and let the rest be filled in by hand.
      return { name: "", type: "", area: "", lat: hints.lat, lon: hints.lon, image: null };
    }
    throw new PlacesApiError("Aus diesem Link konnten keine Ortsdaten gelesen werden. Bitte einen Link zu einem konkreten Ort verwenden (Maps → Teilen).", 400);
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
