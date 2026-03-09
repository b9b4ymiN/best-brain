export function nowMs(): number {
  return Date.now();
}

export function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

export function addDays(timestamp: number, days: number | null): number | null {
  if (days == null) {
    return null;
  }

  return timestamp + daysToMs(days);
}
