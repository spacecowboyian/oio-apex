/**
 * `2026-07-19` -> `JULY.19.26`. Month name in full, day with no leading zero,
 * 2-digit year, dot-separated — the locked event-tag date format (issue #2),
 * the same "2-digit year only" convention as the car-fact rule
 * (decisions/oio-apex/corner-label-rule.md).
 *
 * Parses the ISO parts by hand rather than going through `new Date()` — a
 * `Date` built from a `YYYY-MM-DD` string is parsed as UTC midnight, so
 * reading it back in a negative-offset timezone lands on the previous day
 * (the classic off-by-one). Splitting the literal digits sidesteps that
 * entirely; the value shown is exactly the date typed.
 */
const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

export const formatEventDate = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    throw new Error(`formatEventDate expects an ISO YYYY-MM-DD date, got "${iso}"`);
  }
  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  const monthName = MONTHS[monthIndex];
  if (!monthName) {
    throw new Error(`formatEventDate got an out-of-range month in "${iso}"`);
  }
  // strip a leading zero on the day; keep the last two digits of the year
  return `${monthName}.${Number(day)}.${year.slice(2)}`;
};
