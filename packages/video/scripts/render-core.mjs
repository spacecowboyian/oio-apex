/**
 * Shared batch-render logic — reusable across every video component in this
 * project, not specific to the leaderboard, and used both by the standalone
 * server (`render-server.mjs`) and Storybook's own dev server middleware
 * (`.storybook/render-middleware.mjs`). Bundles the project once per batch
 * and renders each job as a transparent-background ProRes 4444 .mov.
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const execFileAsync = promisify(execFile);

/**
 * Stitches already-rendered clips into one file with `ffmpeg -c copy` — a
 * pure container remux (no re-encode, no quality loss, sub-second even for
 * many large ProRes files), via the concat demuxer. This is the efficient
 * way to do this: the expensive part of "combine into one file" is already
 * done by the time these clips exist (Remotion rendered every frame), so
 * there's nothing left to gain by re-rendering everything again through a
 * single wrapped composition — that would redo the actual frame rendering
 * (the slow part) just to avoid a remux step that's already nearly free.
 * Requires every input to share codec/resolution/frame rate, same as any
 * concat-demuxer stream copy — true here since they all come from the same
 * composition/bundle.
 */
const concatClips = async (filePaths, outputPath) => {
  const listFile = path.join(os.tmpdir(), `render-concat-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  const listContents = filePaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listFile, listContents, "utf8");
  try {
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outputPath]);
  } finally {
    await fs.unlink(listFile).catch(() => {});
  }
};

/** Native macOS folder-picker dialog — resolves to the chosen POSIX path, or
 * `null` if the user cancelled (osascript exits non-zero in that case).
 * `RENDER_SERVER_AUTO_FOLDER` skips the dialog entirely (scripted/CI use). */
export const pickFolder = async () => {
  if (process.env.RENDER_SERVER_AUTO_FOLDER) return process.env.RENDER_SERVER_AUTO_FOLDER;
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Choose a folder to save renders to")',
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
};

/**
 * Prompts for a save folder, bundles `entry` once, and renders every job to
 * a `.mov` in that folder. Returns `{cancelled: true}` if the folder picker
 * was dismissed, otherwise `{folder, results}` (one `{filename, ok, ...}`
 * entry per job — a job's own failure doesn't stop the rest of the batch),
 * plus `combined` when `combine` was requested.
 *
 * `combine`/`combinedFilename`: when set, every job's clip (in `jobs` order —
 * the same order the caller's checkbox list showed them in) is stitched into
 * one `.mov` via `concatClips`, and the individual per-job files are deleted,
 * leaving just the combined file behind. Skipped (with an explanatory error,
 * individual files left untouched) if any job failed to render or fewer than
 * two succeeded — nothing to safely combine.
 */
export const renderBatch = async ({
  projectRoot,
  entry = "src/index.ts",
  compositionId,
  jobs,
  combine = false,
  combinedFilename = "combined",
}) => {
  const folder = await pickFolder();
  if (!folder) return { cancelled: true };

  console.log(`Bundling ${entry}...`);
  const bundleLocation = await bundle({ entryPoint: path.resolve(projectRoot, entry) });

  const results = [];
  for (const job of jobs) {
    const outputLocation = path.join(folder, `${job.filename}.mov`);
    try {
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: compositionId,
        inputProps: job.props,
      });
      console.log(`Rendering ${job.filename}.mov...`);
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "prores",
        proResProfile: "4444",
        // proResProfile alone doesn't get you alpha — ffmpeg still needs an
        // explicit alpha-capable pixel format, and PNG frames to actually
        // carry that alpha channel through to ffmpeg. Same as the CLI
        // recipe in README.md (`--codec=prores --pixel-format=yuva444p10le`).
        pixelFormat: "yuva444p10le",
        imageFormat: "png",
        // none of these compositions play audio, but Remotion still writes a
        // PCM track by default for QuickTime-container compatibility — an
        // audible artifact in an editor, not silence. These are transparent
        // overlay clips laid over a project's real audio, so cut the track
        // entirely rather than shipping unwanted sound on every export.
        muted: true,
        outputLocation,
        inputProps: job.props,
      });
      results.push({ filename: job.filename, ok: true, path: outputLocation });
    } catch (err) {
      console.error(`Failed rendering ${job.filename}:`, err);
      results.push({ filename: job.filename, ok: false, error: String(err?.message ?? err) });
    }
  }

  if (!combine) return { folder, results };

  if (results.some((r) => !r.ok)) {
    return {
      folder,
      results,
      combined: { ok: false, error: "skipped combining — one or more clips failed to render" },
    };
  }
  if (results.length < 2) {
    return {
      folder,
      results,
      combined: { ok: false, error: "skipped combining — need at least 2 rendered clips" },
    };
  }

  const combinedPath = path.join(folder, `${combinedFilename}.mov`);
  try {
    await concatClips(
      results.map((r) => r.path),
      combinedPath,
    );
    // only delete the sources once the combined file exists — never leave
    // the user with neither the individual clips nor a working combined one.
    await Promise.all(results.map((r) => fs.unlink(r.path)));
    return { folder, results, combined: { ok: true, path: combinedPath } };
  } catch (err) {
    console.error("Failed combining clips:", err);
    return { folder, results, combined: { ok: false, error: String(err?.message ?? err) } };
  }
};
