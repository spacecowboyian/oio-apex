#!/usr/bin/env node
/**
 * Turn word-level transcript timings into CaptionCard lines: what each card
 * says, and exactly when it is on screen.
 *
 * This is the part of the captioning pipeline with no rendering in it, so it
 * can be reasoned about and re-run on its own (`node caption-lines.mjs
 * transcript.json 12` prints the cards and the blanks).
 *
 * Four rules, each of which came from watching a real captioned clip:
 *
 * 1. LENGTH IS HARD. The card is one line with `whiteSpace: nowrap`, so a line
 *    measuring wider than the frame is clipped, not wrapped, and nothing
 *    upstream notices. `maxChars` is chosen by caption-fit.mjs against the
 *    target frame; caption-video.mjs then measures what actually rendered and
 *    fails on overflow rather than trusting the count.
 *
 * 2. BREAK WHERE THE SPEAKER BREAKS, and never leave a function word dangling.
 *    Filling each line to the limit splits phrases mid-thought. Pauses are a
 *    good free proxy for phrase boundaries — but continuous speech has no
 *    measurable pauses at all, so on a pure pause score every break ties and
 *    the fullest line wins, which is how you get "...when I" / "am saying it."
 *
 * 3. BALANCE LINES WITHIN A SENTENCE. Greedy left-to-right packing strands the
 *    remainder: "I am saying when I am saying" / "it." — a 3-frame orphan. Each
 *    sentence is split into a fixed number of roughly equal lines chosen
 *    together by DP, so there are no orphans by construction.
 *
 * 4. NEVER SHOW A LINE BEFORE IT IS SPOKEN, and clear the screen when the
 *    speaker stops. See TIMING below.
 */
import fs from "node:fs";

/** silence longer than this counts as the speaker actually stopping */
export const GAP_THRESHOLD = 0.35;
/** how long a card stays up past its last word, at a pause */
export const HOLD_AFTER_SPEECH = 1.0;
/** clear frame guaranteed at a pause, so it reads as a break not a cut */
export const MIN_BLANK = 0.25;

/**
 * Words that shouldn't be left dangling at the end of a line. Standard
 * subtitle practice — an article, preposition, conjunction or bare pronoun
 * left hanging reads as a mistake.
 */
const DANGLING = new Set([
  "a", "an", "the", "and", "or", "but", "so", "if", "as", "that", "than", "when", "while",
  "of", "to", "in", "on", "at", "for", "with", "from", "by", "into", "onto", "about",
  "i", "you", "he", "she", "it", "we", "they", "this", "these", "those", "my", "your",
  "am", "is", "are", "was", "were", "be", "been", "can", "will", "would", "could", "should",
]);

/** in the same units as the squared length-deviation cost below */
const DANGLE_COST = 120;
/** per second of silence at the break */
const PAUSE_BONUS = 40;

/** flatten whisper's segment/word nesting into one word list */
export const wordsFromTranscript = (transcript) =>
  transcript.segments.flatMap((s) => s.words ?? []);

/**
 * Split one sentence into exactly `n` lines, or null if it can't be done under
 * `maxChars`. Cost is squared deviation from an even split, plus a penalty for
 * ending a line on a function word, minus a bonus for breaking where the
 * speaker paused.
 */
const splitSentence = (tok, words, start, end, n, maxChars) => {
  const lineLen = (i, j) => tok.slice(i, j).join(" ").length;
  const breakCost = (k) => {
    const dangles = DANGLING.has(tok[k - 1].toLowerCase().replace(/,/g, "")) ? DANGLE_COST : 0;
    const gap = k < words.length ? words[k].start - words[k - 1].end : 0;
    return dangles - PAUSE_BONUS * gap;
  };

  const target = lineLen(start, end) / n;
  const INF = Infinity;
  const dp = Array.from({ length: n + 1 }, () => new Array(end + 1).fill(INF));
  const back = Array.from({ length: n + 1 }, () => new Array(end + 1).fill(null));
  dp[0][start] = 0;

  for (let l = 1; l <= n; l++) {
    for (let k = start + 1; k <= end; k++) {
      for (let j = start; j < k; j++) {
        if (dp[l - 1][j] === INF) continue;
        const ln = lineLen(j, k);
        if (ln > maxChars) continue;
        let cost = dp[l - 1][j] + (ln - target) ** 2;
        if (k < end) cost += breakCost(k); // no penalty at a sentence end
        if (cost < dp[l][k]) {
          dp[l][k] = cost;
          back[l][k] = j;
        }
      }
    }
  }
  if (dp[n][end] === INF) return null;

  const cuts = [end];
  let k = end;
  for (let l = n; l > 0; l--) {
    k = back[l][k];
    cuts.push(k);
  }
  cuts.reverse();
  // normalised by line count so an n+1 split isn't penalised merely for having
  // one more line to accumulate cost over
  return { score: dp[n][end] / n, cuts };
};

/**
 * TIMING.
 *
 * `start` is the exact start of the card's first word — nothing added, nothing
 * delayed, so a caption never appears before it is said out loud. An earlier
 * version enforced a minimum time on screen by holding short cards past their
 * words and starting the next one late, repaying the lag at the next pause;
 * that bought readability on 7-frame cards by pushing captions off the audio,
 * and sync wins. Mid-phrase cards in fast speech are simply short.
 *
 * `end` depends on whether the speaker actually stopped:
 *   - Continuous speech: run to the next card's start, so cards replace each
 *     other with no blink.
 *   - A real pause: hold HOLD_AFTER_SPEECH past the last word to let the line
 *     land, then blank until the next words begin — clamped to leave at least
 *     MIN_BLANK of clear frame, so a pause shorter than the full hold still
 *     reads as a break rather than as a cut between two cards.
 */
const applyTiming = (cards) =>
  cards.map((c, i) => {
    const last = i + 1 === cards.length;
    const end = last
      ? c.end + HOLD_AFTER_SPEECH // nothing to blank before
      : cards[i + 1].start - c.end <= GAP_THRESHOLD
        ? cards[i + 1].start
        : Math.min(c.end + HOLD_AFTER_SPEECH, cards[i + 1].start - MIN_BLANK);
    return { ...c, end: round2(end), hold: round2(end - c.start) };
  });

const round2 = (n) => Math.round(n * 100) / 100;

/** transcript + a character budget -> the cards to render, timed. */
export function captionLines(transcript, maxChars) {
  const words = wordsFromTranscript(transcript);
  const tok = words.map((w) => w.word.trim());

  // sentences first — the strongest boundary there is
  const sentences = [];
  let start = 0;
  tok.forEach((t, i) => {
    if (/[.?!]$/.test(t) || i === tok.length - 1) {
      sentences.push([start, i + 1]);
      start = i + 1;
    }
  });

  const cards = [];
  for (const [s, e] of sentences) {
    const fewest = Math.max(1, Math.ceil(tok.slice(s, e).join(" ").length / maxChars));
    // Try the minimum line count and one more. Under a tight cap some sentences
    // cannot be split at the minimum without ending a line on a preposition or
    // bare pronoun; spending one extra, shorter line buys a clean break.
    const options = [fewest, fewest + 1]
      .map((n) => splitSentence(tok, words, s, e, n, maxChars))
      .filter(Boolean);
    if (!options.length) {
      throw new Error(`no split fits maxChars=${maxChars} for words ${s}:${e}`);
    }
    const { cuts } = options.reduce((a, b) => (b.score < a.score ? b : a));
    for (let i = 0; i < cuts.length - 1; i++) {
      cards.push({
        text: tok.slice(cuts[i], cuts[i + 1]).join(" "),
        start: round2(words[cuts[i]].start),
        end: round2(words[cuts[i + 1] - 1].end),
      });
    }
  }
  return applyTiming(cards);
}

/** the stretches of clear frame a card set produces */
export const blanksIn = (cards) =>
  cards.slice(0, -1).flatMap((c, i) =>
    cards[i + 1].start - c.end > 0.01 ? [{ from: c.end, to: cards[i + 1].start }] : [],
  );

if (import.meta.url === `file://${process.argv[1]}`) {
  const [transcriptPath, maxChars = "42"] = process.argv.slice(2);
  if (!transcriptPath) {
    console.error("usage: caption-lines.mjs <transcript.json> [maxChars]");
    process.exit(1);
  }
  const cards = captionLines(JSON.parse(fs.readFileSync(transcriptPath, "utf8")), Number(maxChars));
  for (const c of cards) {
    console.log(
      `${c.start.toFixed(2).padStart(6)} -> ${c.end.toFixed(2).padStart(6)}  ` +
        `hold=${c.hold.toFixed(2)}  ${String(c.text.length).padStart(2)}ch  ${c.text}`,
    );
  }
  for (const b of blanksIn(cards)) {
    console.log(`       BLANK ${b.from.toFixed(2)} -> ${b.to.toFixed(2)}  (${(b.to - b.from).toFixed(2)}s clear)`);
  }
}
