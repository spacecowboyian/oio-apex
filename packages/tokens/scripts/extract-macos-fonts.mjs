#!/usr/bin/env node
/**
 * Extracts the brand faces that ship with macOS into packages/tokens/fonts/,
 * then syncs them into the render path.
 *
 *   npm run fonts:extract        # from the repo root
 *
 * Must run ON A MAC — these faces live in the system font folders and are not
 * downloadable. Everything else in the font pipeline is machine-independent;
 * this one step is not.
 *
 * They arrive as `.ttc` collections (several faces in one file), which
 * FontFace/Remotion cannot register directly, so each wanted face is pulled out
 * to its own `.ttf`. Selection is by PostScript name rather than index — the
 * order inside a collection is not guaranteed across macOS versions, and
 * grabbing index 0 silently gives you the wrong weight when it changes.
 *
 * Licensing: these are Apple-supplied faces. Embedding one in a rendered video
 * is ordinary use; committing the binary to a repo is redistribution. Ian asked
 * for them to be added (2026-07-26), the same call he made for the licensed
 * Helvetica Neue embedding on 2026-07-18 — see HANDOFF.md. If that ever needs
 * walking back, delete the files and everything degrades to a fallback on its
 * own; nothing breaks.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(here, "..", "fonts");
const repoRoot = join(here, "..", "..", "..");
const venvPython = join(repoRoot, ".venv", "bin", "python3");

/**
 * Where each face lives on macOS and which PostScript name to pull out.
 * `candidates` is ordered — Supplemental is where Ventura and later keep these,
 * /Library/Fonts is the older location.
 */
const WANTED = [
  {
    token: "signPainter",
    out: "SignPainter.ttf",
    postscript: "SignPainter-HouseScript",
    candidates: [
      "/System/Library/Fonts/Supplemental/SignPainter.ttc",
      "/Library/Fonts/SignPainter.ttc",
      "/System/Library/Fonts/SignPainter.ttc",
    ],
  },
];

const die = (msg) => {
  console.error(`\n${msg}\n`);
  process.exit(1);
};

if (process.platform !== "darwin") {
  die(
    `These faces ship with macOS and cannot be downloaded, so this has to run on a Mac.\n` +
      `Detected platform: ${process.platform}.`,
  );
}

// fontTools does the actual collection split. Same tool used for the Helvetica
// faces already in this folder (HANDOFF.md, 2026-07-18).
//
// A repo-local `.venv` is preferred over whatever `python3` resolves to, because
// a Homebrew python is PEP 668 "externally managed": `pip install --user` is
// refused outright, and `brew install fonttools` links only the CLI binaries —
// neither one makes `import fontTools` work. The venv is the only route that
// doesn't mutate (or risk breaking) the system interpreter.
const hasFontTools = (bin) => {
  try {
    execFileSync(bin, ["-c", "import fontTools"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const python =
  (existsSync(venvPython) && hasFontTools(venvPython) && venvPython) || (hasFontTools("python3") && "python3") || null;

if (!python) {
  die(
    `fontTools is needed to split a .ttc. Create the repo-local venv:\n\n` +
      `    python3 -m venv .venv && .venv/bin/pip install fonttools\n\n` +
      `(run from the repo root; .venv is gitignored). A plain\n` +
      `\`pip install --user fonttools\` fails on a Homebrew python — PEP 668.`,
  );
}

mkdirSync(fontsDir, { recursive: true });

let extracted = 0;
let skipped = 0;

for (const face of WANTED) {
  const dest = join(fontsDir, face.out);
  if (existsSync(dest)) {
    console.log(`already present      ${face.out}`);
    skipped++;
    continue;
  }

  const source = face.candidates.find((p) => existsSync(p));
  if (!source) {
    console.warn(`not found on this Mac ${face.postscript}`);
    console.warn(`                      looked in: ${face.candidates.join(", ")}`);
    skipped++;
    continue;
  }

  const script = `
import sys
from fontTools.ttLib import TTCollection
col = TTCollection(sys.argv[1])
want = sys.argv[2]
names = []
for font in col.fonts:
    ps = ""
    for rec in font["name"].names:
        if rec.nameID == 6:
            ps = rec.toUnicode()
            break
    names.append(ps)
    if ps == want:
        font.save(sys.argv[3])
        print("ok " + ps)
        sys.exit(0)
# selection is by PostScript name, so say what was actually in there when it misses
print("MISS " + "|".join(names))
sys.exit(2)
`;
  try {
    const out = execFileSync(python, ["-c", script, source, face.postscript, dest], { encoding: "utf-8" });
    console.log(`extracted            ${face.out}  ←  ${source}  (${out.trim().replace(/^ok /, "")})`);
    extracted++;
  } catch (err) {
    const stdout = String(err.stdout ?? "").trim();
    if (stdout.startsWith("MISS")) {
      console.error(`no "${face.postscript}" in ${source}`);
      console.error(`  faces present: ${stdout.slice(5).split("|").filter(Boolean).join(", ")}`);
      console.error(`  update WANTED[].postscript in this script to one of those.`);
    } else {
      console.error(`failed to extract ${face.out}: ${String(err.message ?? err).split("\n")[0]}`);
    }
    skipped++;
  }
}

console.log(`\n${extracted} extracted, ${skipped} skipped.`);
if (extracted > 0) {
  // `npm run fonts:extract` chains sync-fonts itself, so only say this when the
  // script was run on its own — otherwise it reads as a step that got missed.
  console.log(`If you ran this directly, sync it into the render path next:`);
  console.log(`    cd packages/video && npm run sync-fonts`);
  console.log(`(\`npm run fonts:extract\` from the repo root already did that for you.)`);
  console.log(`Then restart Storybook — the "SignPainter is not embedded" warning should be gone.`);
}
