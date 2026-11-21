/**
 * Venue-local time helpers. Slots are stored in UTC (timestamptz); operating
 * hours and "show me today's slots" are venue-local in the city's IANA zone.
 */

/** Returns [startUtc, endUtc) covering the given local calendar day. */
export function venueDayRange(dateYmd: string, timeZone: string): { start: Date; end: Date } {
  const start = localToUtc(dateYmd, "00:00", timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Local date + HH:MM in an IANA zone -> UTC instant. */
export function localToUtc(dateYmd: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!));
  const asTz = tzParts(guess, timeZone);
  const asUtc = Date.UTC(
    Number(asTz.year), Number(asTz.month) - 1, Number(asTz.day),
    Number(asTz.hour === "24" ? "0" : asTz.hour), Number(asTz.minute),
  );
  return new Date(guess.getTime() + (guess.getTime() - asUtc));
}

export function venueTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const tz = tzParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(tz.year), Number(tz.month) - 1, Number(tz.day),
    Number(tz.hour === "24" ? "0" : tz.hour), Number(tz.minute),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function tzParts(date: Date, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function todayYmd(timeZone: string): string {
  const p = tzParts(new Date(), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}
