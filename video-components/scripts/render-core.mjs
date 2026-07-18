/**
 * Shared batch-render logic — reusable across every video component in this
 * project, not specific to the leaderboard, and used both by the standalone
 * server (`render-server.mjs`) and Storybook's own dev server middleware
 * (`.storybook/render-middleware.mjs`). Bundles the project once per batch
 * and renders each job as a transparent-background ProRes 4444 .mov.
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const execFileAsync = promisify(execFile);

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
 * entry per job — a job's own failure doesn't stop the rest of the batch).
 */
export const renderBatch = async ({ projectRoot, entry = "src/index.ts", compositionId, jobs }) => {
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
        outputLocation,
        inputProps: job.props,
      });
      results.push({ filename: job.filename, ok: true, path: outputLocation });
    } catch (err) {
      console.error(`Failed rendering ${job.filename}:`, err);
      results.push({ filename: job.filename, ok: false, error: String(err?.message ?? err) });
    }
  }

  return { folder, results };
};
