import { LeaderboardConfig } from "./types";
import { derivePositionSequence, deriveTransitionSnapshots, rosterOrder } from "./runProgress";
import {
  rosterIntroFrames,
  computePositionTransitionDuration,
  computeSimultaneousTransitionDuration,
  computeSimultaneousFinalExitDuration,
  computeSimultaneousFinalEnterDuration,
} from "./layout";

export type RunSequenceLeg = {
  /**
   * Frames the NEXT leg starts early by, overlapping this one's tail. Used for
   * the roster -> run 1 handoff: this leg drawer-closes while the run board
   * drawer-opens over it, so the two read as one board changing what it shows.
   * Laid end-to-end instead, the close and the open are strictly sequential
   * and leave ~0.7s of empty screen between them.
   */
  overlapFrames?: number;
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

  // Optional opening card: who turned up and what they brought, before any
  // times exist (`rosterIntro` in types.ts). It drawer-closes at the end of
  // its leg and the run board drawer-opens behind it — the same book-end the
  // final leg already uses, so the handoff reads as one board changing what
  // it's showing rather than two unrelated cards.
  if (config.rosterIntro) {
    legs.push({
      config: {
        ...config,
        roster: true,
        previousThroughRun: undefined,
        throughRun: undefined,
        enterAnimation: true,
        // hands over to the reshuffle below, which slides these same rows into
        // their run 1 places — so the card must NOT drawer-close first
        animateOut: false,
      } as LeaderboardConfig,
      durationInFrames: rosterIntroFrames(config.racers.length, fps, config.rosterHoldSeconds ?? undefined),
    });
    // ...and then reorganises into run 1 exactly the way run 1 reorganises
    // into run 2: same simultaneous transition, same run-label animation. The
    // racers are handed in already in roster order so the `from` snapshot
    // (previousThroughRun 0 — no runs, so every total ties and the sort is
    // stable) reproduces the card that was just on screen.
    legs.push({
      config: {
        ...config,
        racers: rosterOrder(config.racers, config.featured ?? []),
        rosterTransition: true,
        previousThroughRun: 0,
        throughRun: 1,
        simultaneousLegIsFirst: true,
        enterAnimation: false,
        animateOut: false,
      } as LeaderboardConfig,
      durationInFrames: computeSimultaneousTransitionDuration(fps, config.runIntervalSeconds, true),
    });
  }

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
        // only run 1's leg has no prior leg to inherit a settle hold from —
        // see `simultaneousLegFrames` in layout.ts.
        simultaneousLegIsFirst: run === 1,
      } as LeaderboardConfig;
      const snapshots = deriveTransitionSnapshots(legConfig);
      if (!snapshots) continue;
      legs.push({
        config: legConfig,
        durationInFrames: computeSimultaneousTransitionDuration(fps, legConfig.runIntervalSeconds, run === 1),
      });
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
export const computeRunSequenceDuration = (config: LeaderboardConfig, fps = 30): number => {
  const legs = buildRunSequenceLegs(config, fps);
  // must mirror `LeaderboardRunSequence`'s own cursor exactly, overlaps and
  // all — summing raw durations would overstate the timeline by every
  // overlap and leave that much blank hanging off the end.
  return legs.reduce(
    (sum, leg, i) => sum + leg.durationInFrames - (i < legs.length - 1 ? leg.overlapFrames ?? 0 : 0),
    0,
  );
};
