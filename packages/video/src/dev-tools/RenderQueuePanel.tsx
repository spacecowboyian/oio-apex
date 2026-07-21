import React, { useState } from "react";
import { color, fontStack } from "../theme";
import "../foundations/fonts";

export type RenderJob = {
  id: string;
  /** checkbox label */
  label: string;
  /** output filename, no extension — the server appends `.mov` */
  filename: string;
  /** exact props to hand the composition for this job */
  props: unknown;
};

// same-origin: Storybook's own dev server hosts this at /render via a Vite
// middleware plugin (see .storybook/render-middleware.mjs) — nothing
// separate to start.
const SERVER_URL = "";

/**
 * Reusable "batch export" panel for a Storybook story — a checkbox list of
 * candidate render jobs (whatever "jobs" means for the calling story; e.g.
 * one per run snapshot for the leaderboard) plus a Generate button. Not
 * specific to any one component: pass in `jobs`/`compositionId` and it works
 * the same way everywhere. Every video component in this project needs a way
 * to batch-export its variants as transparent-background clips, so this is
 * meant to be reused rather than rebuilt per component.
 *
 * On "Generate", POSTs the selected jobs to `/render`, which prompts for a
 * save folder (native macOS dialog) and renders each as a ProRes 4444
 * (alpha) .mov. That endpoint is provided by Storybook's own dev server
 * (see .storybook/render-middleware.mjs) whenever `npm run storybook` is
 * running — nothing else to start.
 */
export const RenderQueuePanel: React.FC<{
  title?: string;
  jobs: RenderJob[];
  compositionId: string;
  /** Remotion entry point, relative to the project root the render server runs in. */
  entry?: string;
  /** filename (no extension) for the combined file — the caller's job, since
   * it's the one that knows what these clips are actually named after (e.g.
   * the event title from a story's controls). Falls back to joining the
   * selected jobs' own filenames when the caller doesn't have anything more
   * meaningful to offer. */
  combinedFilename?: string;
}> = ({ title = "Batch export", jobs, compositionId, entry, combinedFilename }) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(jobs.map((j) => j.id)));
  const [status, setStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // off by default — combining deletes the individual clips it just made, so
  // it shouldn't be the silent default for someone who just wants the parts.
  const [combine, setCombine] = useState(false);

  // if the job list changed underneath us (e.g. roster edited, run count
  // changed), drop selections that no longer correspond to a real job.
  const validIds = new Set(jobs.map((j) => j.id));
  const activeSelected = new Set([...selected].filter((id) => validIds.has(id)));

  const allSelected = jobs.length > 0 && jobs.every((j) => activeSelected.has(j.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(jobs.map((j) => j.id)));
  const toggleOne = (id: string) => {
    const next = new Set(activeSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const generate = async () => {
    const chosen = jobs.filter((j) => activeSelected.has(j.id));
    if (chosen.length === 0) return;
    setStatus("rendering");
    setMessage(`Rendering ${chosen.length} clip${chosen.length === 1 ? "" : "s"}… (choose a folder if prompted)`);
    try {
      const res = await fetch(`${SERVER_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compositionId,
          entry,
          jobs: chosen.map((j) => ({ filename: j.filename, props: j.props })),
          combine,
          // the caller's own name wins when it has one (e.g. the event title);
          // otherwise fall back to joining the selected jobs' filenames, in the
          // same order the checkbox list shows them — capped so a long
          // selection doesn't produce an unusable filename.
          combinedFilename:
            combinedFilename ?? `combined-${chosen.map((j) => j.filename).join("-").slice(0, 80)}`,
        }),
      });
      const data = await res.json();
      if (data.cancelled) {
        setStatus("idle");
        setMessage(null);
        return;
      }
      const failed = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      setStatus(failed.length > 0 || data.combined?.ok === false ? "error" : "done");
      const parts: string[] = [];
      parts.push(
        failed.length > 0
          ? `${data.results.length - failed.length}/${data.results.length} clips saved to ${data.folder} — ${failed.length} failed (see browser/server console)`
          : combine
            ? `Rendered ${data.results.length} clip${data.results.length === 1 ? "" : "s"} to ${data.folder}`
            : `Saved ${data.results.length} clip${data.results.length === 1 ? "" : "s"} to ${data.folder}`,
      );
      if (data.combined?.ok) {
        parts.push(`Combined into ${data.combined.path} (individual clips deleted).`);
      } else if (data.combined && !data.combined.ok) {
        parts.push(`Combine skipped: ${data.combined.error}`);
      }
      setMessage(parts.join(" "));
      if (failed.length > 0) console.error("Render failures:", failed);
      if (data.combined && !data.combined.ok) console.error("Combine failed:", data.combined.error);
    } catch {
      setStatus("error");
      setMessage(
        "Couldn't reach the render server — restart Storybook (npm run storybook) so its dev server picks up the render middleware.",
      );
    }
  };

  return (
    <div style={{ width: 220, fontFamily: fontStack("helvetica"), fontSize: 13, color: color.base.white }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: color.base.muted,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ border: "1px solid #333", borderRadius: 8, overflow: "hidden", background: "#161616" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderBottom: "1px solid #333",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          {allSelected ? "Deselect all" : "Select all"}
        </label>
        {/* no max-height/scroll here — a fixed cap silently hid items past
            ~8 rows (an event with more runs than that just looked like it
            was missing them). The page itself scrolls; this list just grows. */}
        <div>
          {jobs.map((job) => (
            <label
              key={job.id}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}
            >
              <input type="checkbox" checked={activeSelected.has(job.id)} onChange={() => toggleOne(job.id)} />
              {job.label}
            </label>
          ))}
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderTop: "1px solid #333",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} />
          Combine into one file (deletes individual clips)
        </label>
        <div style={{ padding: 10, borderTop: "1px solid #333" }}>
          <button
            onClick={generate}
            disabled={status === "rendering" || activeSelected.size === 0}
            style={{
              width: "100%",
              padding: "8px 0",
              fontWeight: 700,
              cursor: status === "rendering" ? "wait" : "pointer",
              opacity: status === "rendering" || activeSelected.size === 0 ? 0.5 : 1,
            }}
          >
            {status === "rendering" ? "Generating…" : "Generate"}
          </button>
          {message && (
            <div style={{ marginTop: 8, fontSize: 12, color: status === "error" ? "#e05252" : color.base.muted }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
