import { PartLine } from "./types";

/**
 * Whole dollars to the nearest dollar, no cents anywhere on the sheet — Ian
 * 2026-07-27. The ledger is a rough estimate of what a build cost, and cents
 * spend a lot of the biggest element on screen implying a precision it doesn't
 * have.
 *
 * Rounding is applied to LINE PRICES, not just to displays, because on a
 * receipt the lines have to add up: round each line and the total independently
 * and the eleven visible Nessie rows sum to $352 while the total reads $353,
 * which looks like a bug and can't be explained away on screen.
 */
export const roundMoney = (n: number): number => Math.round(n);

/**
 * `$1,235`. The component owns money formatting so a config never carries a
 * pre-formatted string — same rule as the leaderboard formatting its own
 * `M:SS.mmm` from raw seconds.
 */
export const formatMoney = (n: number): string =>
  "$" + roundMoney(Math.abs(n)).toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * Splits a formatted amount into the two pieces the hero total draws
 * separately: the currency mark (which never takes the budget colour) and the
 * figure itself.
 */
export const splitMoney = (n: number): { mark: string; dollars: string } => ({
  mark: "$",
  dollars: formatMoney(n).replace("$", ""),
});

/**
 * Running total of the first `count` lines. Derived every time, never supplied
 * — a hand-passed total that disagrees with the visible lines is a bug the data
 * contract shouldn't permit.
 *
 * Sums the ROUNDED prices, so the total is always exactly what the visible rows
 * add up to. The raw ledger values stay untouched in the config; only what the
 * sheet totals is rounded.
 */
export const sumTo = (items: PartLine[], count: number): number =>
  items.slice(0, Math.max(0, Math.min(count, items.length))).reduce((s, i) => s + roundMoney(i.price), 0);

/**
 * Like `sumTo`, but with struck-off lines taken back out — what the sheet
 * actually owes once the wrong parts are crossed off. The money was still
 * spent, so the line stays visible; it just stops counting.
 */
export const netTo = (items: PartLine[], count: number): number =>
  items
    .slice(0, Math.max(0, Math.min(count, items.length)))
    .reduce((s, i) => s + (i.voidedAt != null ? 0 : roundMoney(i.price)), 0);

/** Whether any of the first `count` lines is an estimate — the caller may want
 * to qualify a total built partly from guesses. */
export const hasEstimate = (items: PartLine[], count: number): boolean =>
  items.slice(0, Math.max(0, Math.min(count, items.length))).some((i) => i.est === true);

export type BudgetState = "none" | "under" | "over";

export const budgetStateFor = (total: number, budget: number | null | undefined): BudgetState => {
  if (budget === null || budget === undefined) return "none";
  // `<=` reads as under: landing exactly on the number is not an overrun.
  return total > budget ? "over" : "under";
};
