// Local-time helpers that respect the user's IANA timezone.
//
// Node's Date object holds UTC; to ask "what's the wall-clock minute now for
// this user", we go through Intl.DateTimeFormat which honors any IANA zone
// (and incidentally tracks DST without us caring).

export function minutesOfDayInTz(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hh * 60 + mm;
}

// YYYY-MM-DD as seen in the user's tz — used as a "calendar day" key so the
// once-per-day morning digest doesn't double-fire across UTC midnight.
export function localDateKey(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
