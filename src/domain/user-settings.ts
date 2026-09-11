export type MapProvider = "google" | "apple";

export interface UserSettings {
  mapProvider: MapProvider;
}

export const DEFAULT_USER_SETTINGS: UserSettings = { mapProvider: "google" };

export function isMapProvider(value: unknown): value is MapProvider {
  return value === "google" || value === "apple";
}
