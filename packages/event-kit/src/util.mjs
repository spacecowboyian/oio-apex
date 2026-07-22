// Small shared helpers: process running + fingerprinting.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";

/** Run a command, resolving {code, out, err}. Never rejects on non-zero — callers decide. */
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

/** Throwing variant for steps where failure should abort the asset. */
export async function runOk(cmd, args, opts) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} exited ${r.code}: ${r.err.slice(-400)}`);
  return r;
}

/**
 * Content fingerprint: size + first 1MB + last 1MB, sha256'd.
 *
 * Deliberately NOT a full-file hash — event footage runs to tens of GB and a
 * full hash would dominate ingest. Deliberately NOT path/mtime based either,
 * so the same clip copied in under a different name still dedupes. Head+tail+
 * size is enough to distinguish real assets in practice.
 */
export async function fingerprint(filePath) {
  const { size } = await stat(filePath);
  const CHUNK = 1024 * 1024;
  const hash = createHash("sha256");
  hash.update(String(size));
  const fh = await open(filePath, "r");
  try {
    const head = Buffer.alloc(Math.min(CHUNK, size));
    if (head.length) {
      await fh.read(head, 0, head.length, 0);
      hash.update(head);
    }
    if (size > CHUNK) {
      const tailLen = Math.min(CHUNK, size - CHUNK);
      const tail = Buffer.alloc(tailLen);
      await fh.read(tail, 0, tailLen, size - tailLen);
      hash.update(tail);
    }
  } finally {
    await fh.close();
  }
  return hash.digest("hex").slice(0, 32);
}

export const STILL_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif"]);
export const CLIP_EXT = new Set([".mp4", ".mov", ".m4v", ".avi"]);

export const kindFor = (ext) => (STILL_EXT.has(ext) ? "still" : CLIP_EXT.has(ext) ? "clip" : null);
