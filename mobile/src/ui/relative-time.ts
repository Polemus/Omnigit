/**
 * Short relative timestamps, worded exactly as the desktop words them.
 *
 * A straight port of `Models/TimeFormat.cs`, thresholds and plurals and all, so the same
 * commit does not read "2 days ago" on a laptop and "2d" on a phone. Deliberately not
 * `Intl.RelativeTimeFormat`, which says "2 days ago" for some units and "last month" for
 * others and cannot be talked out of it.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(when: string | undefined): string {
  if (!when) return '';

  const parsed = Date.parse(when);
  if (Number.isNaN(parsed)) return '';

  const delta = Date.now() - parsed;

  // A clock that is a little ahead of the server is ordinary, and "in 3 seconds" reads
  // like a bug. Anything not yet past counts as now.
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return plural(Math.floor(delta / MINUTE), 'minute');
  if (delta < DAY) return plural(Math.floor(delta / HOUR), 'hour');
  if (delta < 30 * DAY) return plural(Math.floor(delta / DAY), 'day');
  if (delta < 365 * DAY) return plural(Math.floor(delta / DAY / 30), 'month');
  return plural(Math.floor(delta / DAY / 365), 'year');
}

function plural(count: number, unit: string): string {
  return count === 1 ? `1 ${unit} ago` : `${count} ${unit}s ago`;
}
