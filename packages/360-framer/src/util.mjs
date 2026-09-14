// Process helpers. Same shape as @oio/event-kit's util so the two CLIs behave
// alike; kept local because this package only needs the spawn wrappers.
import { spawn } from "node:child_process";

/** Run a command, resolving {code, out, err}. Never rejects — callers decide. */
export function run(cmd, args, { timeoutMs = 0 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let out = "";
    let err = "";
    let timer = null;
    if (timeoutMs) timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, out, err: String(e) });
    });
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

/** Throwing variant for steps where failure should abort. */
export async function runOk(cmd, args, opts) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} exited ${r.code}: ${r.err.slice(-400)}`);
  return r;
}

/** Stream a long render so ffmpeg's progress reaches the terminal live. */
export function runLive(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("error", () => resolve(-1));
    p.on("close", (code) => resolve(code ?? -1));
  });
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 *
 * A full-clip serial decode of a 30-minute session is decode-bound on every
 * frame even when only 1-in-N are kept, which is what made the first attempt
 * at this too slow to use. Many small seek-and-grab ffmpeg calls in parallel
 * is the pattern that already worked in this session (the contact-sheet
 * sampling), so scrub extraction reuses it rather than a single fps-filtered
 * pass.
 */
export async function runPool(items, limit, worker) {
  const it = items[Symbol.iterator]();
  const lane = async () => {
    for (let next = it.next(); !next.done; next = it.next()) {
      await worker(next.value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
