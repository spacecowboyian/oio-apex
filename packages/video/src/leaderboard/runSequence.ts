import { LeaderboardConfig } from "./types";
import { derivePositionSequence, deriveTransitionSnapshots } from "./runProgress";
import {
  computePositionTransitionDuration,
  computeSimultaneousTransitionDuration,
  computeSimultaneousFinalExitDuration,
  computeSimultaneousFinalEnterDuration,
} from "./layout";

export type RunSequenceLeg = {
  /** the same base config, with `previousThroughRun`/`throughRun` set to this
   * leg's pair — everything else (racers, featured, frame size, ...) passes
   * through unchanged. Handed straight to `Leaderboard`, which already knows
   * how to render a `previousThroughRun` transition; this file only
   * sequences which pairs and how long each gets. */
  config: LeaderboardConfig;
  durationInFrames: number;
};

/**
 * Chains the Leaderboard's existing single-transition "camera follow"
 * animation (`previousThroughRun` -> `throughRun`, see runProgress.ts and
 * leaderboard-design-rules.md) across every run of the event, back to back:
 * run 1->2, 2->3, ..., (R-1)->R, then a final leg from R to the true final
 * state — a distinct labeled beat ("FINAL" instead of "RUN R" in the title
 * bar) even on events where the numbers already match once every run's in.
 * In `simultaneousPositionChange` mode specifically, that last beat isn't
 * an in-place reshuffle like every earlier leg — it's split into two plain
 * (non-transition) legs that book-end it: the board holding on run R's
 * standings drawer-closes off screen, then the true final board
 * drawer-opens back in (see `computeSimultaneousFinalExitDuration`/
 * `computeSimultaneousFinalEnterDuration` in layout.ts).
 *
 * Deliberately does not touch the transition animation itself — each leg is
 * just a normal `LeaderboardConfig` that `Leaderboard` already knows how to
 * render (see `derivePositionSequence` in runProgress.ts). This file's only
 * job is building the list of (previousThroughRun, throughRun) pairs and
 * each one's duration, for `LeaderboardRunSequence` to lay out as
 * consecutive Remotion `Sequence`s.
 *
 * Works with either transition mode a leg's config selects (see
 * `simultaneousPositionChange` in types.ts): the default staged "camera
 * follows one featured racer at a time" mode requires a non-empty `featured`
 * list under `highlightMode: "manual"` (same requirement
 * `derivePositionSequence` has for a single transition — no camera follow
 * without someone to follow); the "everyone moves at once" mode has no such
 * requirement and never skips a leg, since its run-label flash is the point
 * of every leg regardless of whether any rank changed.
 */
export const buildRunSequenceLegs = (config: LeaderboardConfig, fps = 30): RunSequenceLeg[] => {
  if (config.eventType === "track") {
    throw new Error("LeaderboardRunSequence: track events have no runs to sequence through.");
  }
  if (!config.simultaneousPositionChange && (config.highlightMode !== "manual" || !config.featured?.length)) {
    throw new Error(
      "LeaderboardRunSequence: needs highlightMode: \"manual\" and a non-empty `featured` list — there's no camera-follow transition without someone to follow. (Not required when simultaneousPositionChange is set — every row moves together, nothing to follow.)",
    );
  }
  const totalRuns = Math.max(0, ...config.racers.map((r) => r.runs.length));
  if (totalRuns < 2) {
    throw new Error("LeaderboardRunSequence: needs at least 2 runs to show a position change.");
  }

  const legs: RunSequenceLeg[] = [];
  for (let run = 1; run <= totalRuns; run++) {
    const isFinalLeg = run === totalRuns;

    if (config.simultaneousPositionChange) {
      if (isFinalLeg) {
        // the last run's book-end: the board holding on run R's standings
        // drawer-closes off screen (a plain board, not a transition — the
        // content it shows never changes, only `animateOut` is forced), then
        // the true final board drawer-opens back in (`throughRun` unset —
        // the real final state, not another snapshot). See layout.ts's
        // `computeSimultaneousFinal*Duration` doc comment.
        const exitingConfig = {
          ...config,
          previousThroughRun: undefined,
          throughRun: run,
          animateOut: true,
        } as LeaderboardConfig;
        const enteringConfig = {
          ...config,
          previousThroughRun: undefined,
          throughRun: undefined,
          enterAnimation: true,
          // the true final board — nothing plays after it, so it holds on
          // screen instead of drawer-closing back out like every other leg.
          animateOut: false,
        } as LeaderboardConfig;
        legs.push({ config: exitingConfig, durationInFrames: computeSimultaneousFinalExitDuration(fps) });
        legs.push({ config: enteringConfig, durationInFrames: computeSimultaneousFinalEnterDuration(fps) });
        break;
      }
      // every row reshuffles together regardless of whether any rank
      // actually changed, and the run-label flash is the point of every
      // leg — so unlike the staged mode below, nothing gets skipped here.
      const legConfig = {
        ...config,
        previousThroughRun: run,
        throughRun: run + 1,
      } as LeaderboardConfig;
      const snapshots = deriveTransitionSnapshots(legConfig);
      if (!snapshots) continue;
      legs.push({ config: legConfig, durationInFrames: computeSimultaneousTransitionDuration(fps) });
      continue;
    }

    const legConfig = {
      ...config,
      previousThroughRun: run,
      throughRun: isFinalLeg ? undefined : run + 1,
    } as LeaderboardConfig;
    const sequence = derivePositionSequence(legConfig);
    // a leg where no featured racer's rank actually changes has nothing for
    // the camera-follow animation to do — `derivePositionSequence` returns
    // null, and `Leaderboard` would silently fall back to its plain
    // scroll-stop board for just that leg, breaking the chained look. Skip
    // it rather than render a leg that looks like a different presentation
    // from its neighbors; the run number still advances on the next leg's
    // title bar, so nothing about the event goes unrepresented.
    if (!sequence) continue;
    legs.push({
      config: legConfig,
      durationInFrames: computePositionTransitionDuration(sequence.moverNames.length, fps),
    });
    if (isFinalLeg) break;
  }
  return legs;
};

/** Total duration (frames) for the whole chained sequence — every leg's
 * duration summed, at a given fps. */
export const computeRunSequenceDuration = (config: LeaderboardConfig, fps = 30): number =>
  buildRunSequenceLegs(config, fps).reduce((sum, leg) => sum + leg.durationInFrames, 0);
