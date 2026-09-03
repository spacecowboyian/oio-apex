import { RallycrossRacer } from "../leaderboard/types";

export interface SplitTimeComparisonProps {
  driver1: RallycrossRacer;
  driver2: RallycrossRacer;
  highlight?: 1 | 2;
  viewMode?: "runs" | "margin";
}
