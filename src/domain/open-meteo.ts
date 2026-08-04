import { enumerateDates, parseISODate } from "./dates";

export type WeatherKind = "forecast" | "recorded" | "average";

export interface DailyWeather {
  date: string;
  kind: WeatherKind;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  sunrise: string;
  sunset: string;
}

const FORECAST_HORIZON_DAYS = 15;
const AVERAGE_YEARS = 5;

type Bucket = "past" | "forecast" | "future";

function bucketFor(date: string, today: Date): Bucket {
  const target = parseISODate(date);
  const offset = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (offset < 0) return "past";
  if (offset <= FORECAST_HORIZON_DAYS) return "forecast";
  return "future";
}

interface DailyApiResponse {
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    weathercode: number[];
    sunrise: string[];
    sunset: string[];
  };
}

/** Extracts "HH:MM" from an Open-Meteo local ISO timestamp like "2026-09-09T07:12". */
function formatTime(isoDateTime: string): string {
  return isoDateTime.slice(11, 16);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60) % 24;
  const mins = rounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

async function fetchDailyRange(
  baseUrl: string,
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<DailyApiResponse> {
  const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wetterdienst antwortete mit ${response.status}`);
  }
  return response.json();
}

function groupIntoRuns(dates: string[], today: Date): { bucket: Bucket; start: string; end: string }[] {
  const runs: { bucket: Bucket; start: string; end: string }[] = [];
  for (const date of dates) {
    const bucket = bucketFor(date, today);
    const last = runs[runs.length - 1];
    if (last && last.bucket === bucket) {
      last.end = date;
    } else {
      runs.push({ bucket, start: date, end: date });
    }
  }
  return runs;
}

/** Fetches daily weather for every date in [startDate, endDate]. Dates within the real
 * forecast horizon use live forecasts, past dates use recorded history, and dates too far
 * in the future to forecast fall back to a same-calendar-day average across the last
 * few years — clearly labeled via `kind` so the UI can be honest about which is which. */
export async function fetchLocationWeather(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<Map<string, DailyWeather>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = enumerateDates(startDate, endDate);
  const result = new Map<string, DailyWeather>();
  const runs = groupIntoRuns(dates, today);

  for (const run of runs) {
    if (run.bucket === "forecast" || run.bucket === "past") {
      const baseUrl =
        run.bucket === "forecast"
          ? "https://api.open-meteo.com/v1/forecast"
          : "https://archive-api.open-meteo.com/v1/archive";
      const data = await fetchDailyRange(baseUrl, lat, lon, run.start, run.end);
      data.daily.time.forEach((date, index) => {
        const tempMax = data.daily.temperature_2m_max[index];
        const tempMin = data.daily.temperature_2m_min[index];
        if (tempMax == null || tempMin == null) return;
        result.set(date, {
          date,
          kind: run.bucket === "forecast" ? "forecast" : "recorded",
          tempMax: Math.round(tempMax),
          tempMin: Math.round(tempMin),
          weatherCode: data.daily.weathercode[index],
          sunrise: formatTime(data.daily.sunrise[index]),
          sunset: formatTime(data.daily.sunset[index]),
        });
      });
      continue;
    }

    const currentYear = today.getFullYear();
    const samplesByMonthDay = new Map<
      string,
      { max: number[]; min: number[]; codes: number[]; sunrise: number[]; sunset: number[] }
    >();

    for (let yearsAgo = 1; yearsAgo <= AVERAGE_YEARS; yearsAgo++) {
      const year = currentYear - yearsAgo;
      const yearStart = `${year}-${run.start.slice(5)}`;
      const yearEnd = `${year}-${run.end.slice(5)}`;
      const data = await fetchDailyRange(
        "https://archive-api.open-meteo.com/v1/archive",
        lat,
        lon,
        yearStart,
        yearEnd,
      );
      data.daily.time.forEach((histDate, index) => {
        const max = data.daily.temperature_2m_max[index];
        const min = data.daily.temperature_2m_min[index];
        const code = data.daily.weathercode[index];
        if (max == null || min == null) return;
        const monthDay = histDate.slice(5);
        const entry = samplesByMonthDay.get(monthDay) ?? { max: [], min: [], codes: [], sunrise: [], sunset: [] };
        entry.max.push(max);
        entry.min.push(min);
        entry.codes.push(code);
        entry.sunrise.push(timeToMinutes(formatTime(data.daily.sunrise[index])));
        entry.sunset.push(timeToMinutes(formatTime(data.daily.sunset[index])));
        samplesByMonthDay.set(monthDay, entry);
      });
    }

    for (const date of enumerateDates(run.start, run.end)) {
      const monthDay = date.slice(5);
      const samples = samplesByMonthDay.get(monthDay);
      if (!samples || samples.max.length === 0) continue;
      const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      const codeCounts = new Map<number, number>();
      samples.codes.forEach((code) => codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1));
      const weatherCode = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
      result.set(date, {
        date,
        kind: "average",
        tempMax: Math.round(average(samples.max)),
        tempMin: Math.round(average(samples.min)),
        weatherCode,
        sunrise: minutesToTime(average(samples.sunrise)),
        sunset: minutesToTime(average(samples.sunset)),
      });
    }
  }

  return result;
}
