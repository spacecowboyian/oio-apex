// Renders the "The car felt great" tee mockup + print artwork with headless
// Chromium (no npm install needed: the browser Playwright ships is enough).
//
//   node packages/merch/car-felt-great/render.mjs
//
// Brand values come from packages/tokens/tokens.json at render time; the HTML
// is a template with __TOKENS__ / __FONT_DIR__ slots, so the mockup cannot
// carry a hex the token file does not.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokensDir = resolve(here, "../../tokens");
const tokens = readFileSync(join(tokensDir, "tokens.json"), "utf-8");
const fontDir = join(tokensDir, "fonts");
for (const f of ["HelveticaNeue-Bold.ttf", "HelveticaNeue-Regular.ttf"]) {
  if (!existsSync(join(fontDir, f))) throw new Error(`missing required brand face ${f} in ${fontDir}`);
}

const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });

const html = readFileSync(join(here, "mockup.html"), "utf-8")
  .replace('<script id="tokens" type="application/json">__TOKENS__</script>', () => `<script id="tokens" type="application/json">${tokens}</script>`)
  .replaceAll("__FONT_DIR__", fontDir);
const page = join(outDir, ".mockup.filled.html");
writeFileSync(page, html);

// Prefer the headless SHELL over full Chrome. In full Chrome's `--headless=new`,
// `--window-size` is the OUTER window, so a 900px window paints an ~813px
// viewport and the screenshot's bottom ~87px is never drawn: the print file's
// label box came out cut off along its lower edge and read as text sitting low
// in the box (Ian, 2026-09-10). The shell has no window chrome, so window size
// is viewport size and the PNG is exactly what was laid out.
function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error("no Chromium found; set CHROME_PATH");
  return hit;
}
const isShell = () => /headless_shell/.test(chrome());

const shots = [
  // black tee, two-tone print, 2x for crisp type
  { name: "tee-two-tone.png", query: "view=mockup&variant=two-tone&scale=1.8&x=100&y=120", w: 2000, h: 2400, bg: null },
  { name: "tee-mono.png",     query: "view=mockup&variant=mono&scale=1.8&x=100&y=120",     w: 2000, h: 2400, bg: null },
  // the print alone on the garment black, punch line at 320px
  { name: "print-two-tone.png", query: "view=artwork&variant=two-tone", w: 2040, h: 900, bg: null },
  { name: "print-mono.png",     query: "view=artwork&variant=mono",     w: 2040, h: 900, bg: null },
];

const base = [
  ...(isShell() ? [] : ["--headless=new"]), "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--allow-file-access-from-files", "--no-first-run", "--disable-extensions",
  "--virtual-time-budget=6000",
];

for (const s of shots) {
  const url = pathToFileURL(page).href + "?" + s.query;
  const out = join(outDir, s.name);
  const args = [
    ...base, `--window-size=${s.w},${s.h}`,
    ...(s.bg ? [`--default-background-color=${s.bg}`] : []),
    `--screenshot=${out}`, url,
  ];
  execFileSync(chrome(), args, { stdio: ["ignore", "ignore", "pipe"] });

  // Measure what was actually rendered. The page records the ink geometry it
  // solved for; a print that overflowed or drifted off-centre would still
  // screenshot fine and exit 0, so the assertion has to be here.
  const dom = execFileSync(chrome(), [...base, `--window-size=${s.w},${s.h}`, "--dump-dom", url],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  const m = dom.match(/data-fit="([^"]*)"/);
  if (!m) throw new Error(`${s.name}: page never reported its fit (fonts or script failed)`);
  const fit = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  const problems = [];
  if (Math.abs(fit.wP - fit.wS) > 1) problems.push(`rows differ: punch ${fit.wP.toFixed(1)} vs setup ${fit.wS.toFixed(1)}`);
  if (fit.inkCentre != null) {
    if (Math.abs(fit.wP - fit.printWidth) > 1) problems.push(`print is ${fit.wP.toFixed(1)} units, wanted ${fit.printWidth}`);
    if (Math.abs(fit.inkCentre - 500) > 1) problems.push(`print centre at x=${fit.inkCentre.toFixed(1)}, shirt centre is 500`);
  }
  if (problems.length) throw new Error(`${s.name}: ${problems.join("; ")}`);
  console.log("wrote", out,
    `(rows ${fit.wP.toFixed(1)}/${fit.wS.toFixed(1)}` +
    (fit.inkCentre != null ? `, centre ${fit.inkCentre.toFixed(1)}, ink top ${fit.inkTop.toFixed(0)}` : "") + ")");
}
