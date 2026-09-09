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

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
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

const shots = [
  // black tee, two-tone print, 2x for crisp type
  { name: "tee-two-tone.png", query: "view=mockup&variant=two-tone&scale=1.8&x=100&y=120", w: 2000, h: 2400, bg: null },
  { name: "tee-mono.png",     query: "view=mockup&variant=mono&scale=1.8&x=100&y=120",     w: 2000, h: 2400, bg: null },
  // the print alone on the garment black, punch line at 320px
  { name: "print-two-tone.png", query: "view=artwork&variant=two-tone", w: 2040, h: 900, bg: null },
  { name: "print-mono.png",     query: "view=artwork&variant=mono",     w: 2040, h: 900, bg: null },
];

for (const s of shots) {
  const url = pathToFileURL(page).href + "?" + s.query;
  const out = join(outDir, s.name);
  const args = [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--allow-file-access-from-files", "--no-first-run", "--disable-extensions",
    `--window-size=${s.w},${s.h}`, "--virtual-time-budget=6000",
    ...(s.bg ? [`--default-background-color=${s.bg}`] : []),
    `--screenshot=${out}`, url,
  ];
  execFileSync(chrome(), args, { stdio: ["ignore", "ignore", "pipe"] });
  console.log("wrote", out);
}
