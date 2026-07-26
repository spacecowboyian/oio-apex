import { PartLine } from "./types";

/**
 * `$1,234.56`. The component owns money formatting so a config never carries a
 * pre-formatted string — same rule as the leaderboard formatting its own
 * `M:SS.mmm` from raw seconds.
 */
export const formatMoney = (n: number): string =>
  "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Splits a formatted amount into the three pieces the hero total draws
 * separately: the currency mark (held at ink black whatever the budget state
 * is doing), the dollars, and the cents (set smaller and pulled in).
 */
export const splitMoney = (n: number): { mark: string; dollars: string; cents: string } => {
  const [whole, frac] = formatMoney(n).split(".");
  return { mark: "$", dollars: whole.replace("$", ""), cents: "." + frac };
};

/** Running total of the first `count` lines. Derived every time, never supplied
 * — a hand-passed total that disagrees with the visible lines is a bug the data
 * contract shouldn't permit. */
export const sumTo = (items: PartLine[], count: number): number =>
  items.slice(0, Math.max(0, Math.min(count, items.length))).reduce((s, i) => s + i.price, 0);

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
