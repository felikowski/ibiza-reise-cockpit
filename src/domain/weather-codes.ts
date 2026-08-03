export interface WeatherCodeInfo {
  label: string;
  symbol: string;
}

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: "Klarer Himmel", symbol: "☀" },
  1: { label: "Überwiegend klar", symbol: "🌤" },
  2: { label: "Teilweise bewölkt", symbol: "⛅" },
  3: { label: "Bedeckt", symbol: "☁" },
  45: { label: "Nebel", symbol: "🌫" },
  48: { label: "Nebel mit Reif", symbol: "🌫" },
  51: { label: "Leichter Nieselregen", symbol: "🌦" },
  53: { label: "Nieselregen", symbol: "🌦" },
  55: { label: "Starker Nieselregen", symbol: "🌦" },
  56: { label: "Gefrierender Nieselregen", symbol: "🌦" },
  57: { label: "Starker gefrierender Nieselregen", symbol: "🌦" },
  61: { label: "Leichter Regen", symbol: "🌧" },
  63: { label: "Regen", symbol: "🌧" },
  65: { label: "Starker Regen", symbol: "🌧" },
  66: { label: "Gefrierender Regen", symbol: "🌧" },
  67: { label: "Starker gefrierender Regen", symbol: "🌧" },
  71: { label: "Leichter Schneefall", symbol: "🌨" },
  73: { label: "Schneefall", symbol: "🌨" },
  75: { label: "Starker Schneefall", symbol: "🌨" },
  77: { label: "Schneekörner", symbol: "🌨" },
  80: { label: "Leichte Schauer", symbol: "🌦" },
  81: { label: "Schauer", symbol: "🌦" },
  82: { label: "Heftige Schauer", symbol: "⛈" },
  85: { label: "Leichte Schneeschauer", symbol: "🌨" },
  86: { label: "Starke Schneeschauer", symbol: "🌨" },
  95: { label: "Gewitter", symbol: "⛈" },
  96: { label: "Gewitter mit leichtem Hagel", symbol: "⛈" },
  99: { label: "Gewitter mit starkem Hagel", symbol: "⛈" },
};

export function describeWeatherCode(code: number): WeatherCodeInfo {
  return WEATHER_CODES[code] ?? { label: "Unbekannt", symbol: "?" };
}
