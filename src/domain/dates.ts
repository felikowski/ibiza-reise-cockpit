export function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = parseISODate(startDate);
  const end = parseISODate(endDate);
  while (current <= end) {
    dates.push(formatISODate(current));
    current = addDays(current, 1);
  }
  return dates;
}
