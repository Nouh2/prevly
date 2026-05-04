export const TFT_WEEK_COUNT = 56;
export const TFT_LAUNCH_WEEKS = 4;

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || 2026, (month || 1) - 1, day || 1);
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function addWeeks(date: Date, weeks: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

export function generateTftWeeks(openingDate: string): Date[] {
  const start = parseIsoDate(openingDate);
  return Array.from({ length: TFT_WEEK_COUNT }, (_, index) => addWeeks(start, index));
}

export function monthIndex(date: Date): number {
  return date.getMonth();
}
