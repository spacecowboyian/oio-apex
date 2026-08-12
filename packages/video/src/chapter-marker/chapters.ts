import { Chapter } from "./types";

/**
 * One chapter list, two outputs: the on-screen `ChapterMarker`s and the
 * timestamp block that goes in the YouTube description.
 *
 * They are the same information, and keeping them in one array is the point.
 * Typed separately they drift — the video says "03 — BLEEDING THE BRAKES" and
 * the description says "3. Brake bleed" thirty seconds off, which is the same
 * bug class as the brand guide restating its own tokens.
 */

/** `h:mm:ss` past an hour, `m:ss` under it — the format YouTube parses. */
export const timestamp = (totalSeconds: number): string => {
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

/**
 * YouTube only turns a description into chapters when all of these hold. They
 * are the platform's rules, not ours, and they fail silently — the description
 * just renders as text and nobody notices until someone looks for the chapter
 * bar.
 */
export const validateChapters = (chapters: Chapter[]): string[] => {
  const problems: string[] = [];
  const ordered = [...chapters].sort((a, b) => a.startSeconds - b.startSeconds);

  if (ordered.length < 3) {
    problems.push(`YouTube needs at least 3 chapters; got ${ordered.length}.`);
  }
  if (ordered.length > 0 && ordered[0].startSeconds !== 0) {
    problems.push(
      `The first chapter must start at 0:00; "${ordered[0].title}" starts at ${timestamp(
        ordered[0].startSeconds
      )}.`
    );
  }
  ordered.forEach((chapter, i) => {
    const next = ordered[i + 1];
    if (!next) return;
    const length = next.startSeconds - chapter.startSeconds;
    if (length < 10) {
      problems.push(
        `"${chapter.title}" runs ${length}s; every chapter must be at least 10s.`
      );
    }
  });

  const seen = new Set<string>();
  for (const chapter of ordered) {
    const key = timestamp(chapter.startSeconds);
    if (seen.has(key)) problems.push(`Two chapters both start at ${key}.`);
    seen.add(key);
  }

  return problems;
};

/**
 * The description block. Sequence numbers are deliberately left off: the video
 * shows "02" in the marker box, but YouTube renders its own list, and a
 * description line reading "0:42 02 — Bleeding the brakes" double-numbers it.
 *
 * Throws on a list YouTube would reject rather than emitting a block that
 * silently renders as plain text.
 */
export const buildYouTubeChapters = (chapters: Chapter[]): string => {
  const problems = validateChapters(chapters);
  if (problems.length > 0) {
    throw new Error(`Chapter list YouTube will not accept:\n- ${problems.join("\n- ")}`);
  }
  return [...chapters]
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((chapter) => `${timestamp(chapter.startSeconds)} ${chapter.title}`)
    .join("\n");
};
