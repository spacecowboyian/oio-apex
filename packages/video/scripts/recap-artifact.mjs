#!/usr/bin/env node
/**
 * Emit the build record for a narrated recap, from the job manifest.
 *
 * One section per stage, in the order the stages actually run: results and
 * media arrive together, the script comes off the times, the clips get laid
 * against the script, then the read, then the audio, then the picture cut to
 * match it, then publish. That ordering is the point of the page — it is what
 * makes the dependency between stage 3 and stage 6 visible, and it is the order
 * someone repeating the job needs.
 *
 * This writes HTML only. Publishing it is the caller's job (the Artifact tool),
 * because this script has no way to reach claude.ai and should not pretend to.
 *
 * Every stage degrades: a stage with nothing recorded for it says so rather
 * than being silently omitted, because a missing section reads as "this did not
 * happen" when the truth is usually "nobody wrote it down".
 *
 * Usage: node scripts/recap-artifact.mjs <manifest.json> [out.html]
 */
import fs from "node:fs/promises";
import path from "node:path";
import tokens from "@oio/tokens/tokens.json" with { type: "json" };
import { loadManifest, saveManifest, resolve, usage } from "./recap-core.mjs";

const [manifestPath, outArg] = process.argv.slice(2);
if (!manifestPath) usage("Usage: node scripts/recap-artifact.mjs <manifest.json> [out.html]");

const m = await loadManifest(manifestPath);
const work = resolve(m, m.work ?? ".");
const out = outArg ?? path.join(work, `${m.event?.slug ?? "recap"}-build-record.html`);

// --- helpers ---------------------------------------------------------------
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/**
 * Curl quotes so body copy does not read like a terminal.
 *
 * Runs against the ESCAPED string, so the pairs to match are `&quot;` and not
 * `"` — escaping happens first and a regex looking for a bare double quote will
 * silently never fire.
 */
const typo = (s) => esc(s)
  .replace(/(\w)'(\w)/g, "$1&rsquo;$2")
  .replace(/&quot;([^&]*(?:&(?!quot;)[^&]*)*)&quot;/g, "&ldquo;$1&rdquo;")
  .replace(/(^|\s)'(\w)/g, "$1&lsquo;$2")
  .replace(/(\w)'(\s|$)/g, "$1&rsquo;$2");

const clock = (s) => {
  if (s == null) return "&mdash;";
  const mm = Math.floor(s / 60);
  const ss = (s - mm * 60).toFixed(3).padStart(6, "0");
  return mm ? `${mm}:${ss}` : Number(s).toFixed(3);
};
const num = (n, p = 2) => (n == null ? "&mdash;" : Number(n).toFixed(p));
const has = (v) => v != null && (!Array.isArray(v) || v.length > 0);

/** A stage that has nothing recorded still gets its heading and says why. */
const empty = (what) =>
  `<p class="note empty">Nothing recorded for this stage. ${esc(what)}</p>`;

const table = (headers, rows) => `<div class="scroller"><table>
<thead><tr>${headers.map((h) => `<th${h.num ? ' class="num"' : ""}>${esc(h.label ?? h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr${r.cls ? ` class="${r.cls}"` : ""}>${
  r.cells.map((c) => `<td class="${[c.num ? "num" : "", c.mono ? "mono" : "", c.cls ?? ""].filter(Boolean).join(" ")}">${c.html ?? esc(c.value)}</td>`).join("")
}</tr>`).join("")}</tbody></table></div>`;

// --- gather ----------------------------------------------------------------
let config = null;
try { config = JSON.parse(await fs.readFile(resolve(m, m.config), "utf-8")); } catch { /* optional */ }
let layout = null;
try { layout = JSON.parse(await fs.readFile(resolve(m, m.layout), "utf-8")); } catch { /* optional */ }

// --- 1. results + media ----------------------------------------------------
function stageResults() {
  let results = empty("Point manifest.config at the leaderboard config.");
  if (config?.racers?.length) {
    const sorted = [...config.racers].sort((a, b) => a.total - b.total);
    const leader = sorted[0].total;
    const featured = new Set(config.featured ?? []);
    results = table(
      ["Pos", "Driver", { label: "Total", num: 1 }, { label: "Gap", num: 1 }, { label: "Cones", num: 1 }],
      sorted.map((r, i) => ({
        cls: i === 0 ? "win" : featured.has(r.name) ? "" : "dim",
        cells: [
          { value: i + 1 },
          { value: r.name },
          { html: clock(r.total), num: 1 },
          { html: i === 0 ? "&mdash;" : `+${clock(r.total - leader)}`, num: 1 },
          { value: (r.cones ?? []).reduce((a, b) => a + b, 0), num: 1 },
        ],
      })),
    );
  }
  const media = has(m.media)
    ? `<ul class="bullets">${m.media.map((x) =>
        `<li><b>${esc(x.what ?? x)}</b>${x.note ? ` ${typo(x.note)}` : ""}</li>`).join("")}</ul>`
    : empty("Add manifest.media as a list of what was shot and on what.");

  return `
    <p class="note">These are the only two inputs. Everything downstream is
    derived from them, so nothing else starts until both are in hand. The board
    render depends on the results alone, which is why it starts here rather than
    at stage 6.</p>
    <div class="parallel">
      <div class="panel"><h3>Results</h3>${results}
        <p class="note">Times are <b>credited</b>, penalties already added, so a
        gap is not a pace difference.</p></div>
      <div class="panel"><h3>Media</h3>${media}</div>
    </div>`;
}

// --- 2. script -------------------------------------------------------------
function stageScript() {
  if (!has(m.script)) return empty("Add manifest.script as [{ id, text }] per card.");
  return `<dl class="script">${m.script.map((b) =>
    `<div class="beat"><dt>${esc(b.id)}</dt><dd>${typo(b.text)}</dd></div>`).join("")}</dl>`;
}

// --- 3. clip layout --------------------------------------------------------
function stageLayout() {
  if (!layout?.clips?.length) return empty("Point manifest.layout at the clip layout tool's layout.json.");
  const clips = layout.clips.filter((c) => c.enabled !== false).sort((a, b) => a.order - b.order);
  const entry = m.entryCardClips ?? 3;
  const ids = m.cards?.map((c) => c.id) ?? [];

  const slots = [];
  for (let i = 0; i < entry; i++) slots.push({ card: `${ids[0] ?? "entry"} ${i + 1}/${entry}`, clip: clips[i] });
  for (let c = 1; c <= (m.cards?.length ?? 0) - 2; c++) slots.push({ card: ids[c] ?? `card ${c}`, clip: clips[entry + c - 1] });
  slots.push({ card: ids[ids.length - 1] ?? "final", clip: clips[clips.length - 1] });

  const used = new Set(slots.map((s) => s.clip));
  const spare = clips.filter((c) => !used.has(c));

  return `
    <p class="note">Order, crop and a <b>centre time</b> per clip. The centre is
    what gets honoured: when a card&rsquo;s length changes at stage 6 the source
    window grows or shrinks around the same moment instead of drifting off the
    action. That is what makes the retime cheap.</p>
    ${table(["Card", "Clip", { label: "Centre", num: 1 }, { label: "Speed", num: 1 }],
      slots.filter((s) => s.clip).map((s) => ({ cells: [
        { value: s.card },
        { value: s.clip.file.replace(/\.[^.]+$/, "").slice(0, 40), mono: 1 },
        { value: num(s.clip.center), num: 1 },
        { value: `${Math.round((s.clip.speed ?? 1) * 100)}%`, num: 1 },
      ] })))}
    ${spare.length ? `<p class="note">In the layout but unused: ${
      spare.map((c) => `<code>${esc(c.file)}</code> @ ${num(c.center)}`).join(", ")}</p>` : ""}`;
}

// --- 4. record -------------------------------------------------------------
function stageRecord() {
  const r = m.record;
  if (!r) return empty("Add manifest.record as { seconds, device, wpm }.");
  return `<p class="note">
    ${r.device ? `<b>${esc(r.device)}</b>, ` : ""}one continuous take,
    <b>${num(r.seconds)}s</b> of tape${r.wpm ? ` at roughly ${esc(r.wpm)} words per minute` : ""}.
    Flubs are left in and fixed at the next stage rather than punched in, which
    keeps the read&rsquo;s momentum.</p>`;
}

// --- 5. audio --------------------------------------------------------------
function stageAudio() {
  const a = m.audio;
  if (!has(a?.keepers)) return empty("Run recap-vo.mjs.");
  const backwards = a.keepers.some((k, i) => i > 0 && k.in < a.keepers[i - 1].in);
  const meas = a.measured ?? {};
  return `
    <p class="note">Cut, in the order the pieces end up:</p>
    ${table([{ label: "In", num: 1 }, { label: "Out", num: 1 }, "Keeps"],
      a.keepers.map((k) => ({ cells: [
        { value: num(k.in), num: 1 }, { value: num(k.out), num: 1 }, { html: typo(k.note ?? "") },
      ] })))}
    ${has(a.dropped) ? `<ul class="bullets">${a.dropped.map((d) => `<li>Dropped: ${typo(d)}</li>`).join("")}</ul>` : ""}
    ${backwards ? `<p class="note">One row runs backwards. A keeper is lifted from
      an earlier delivery and dropped in later, which is deliberate: keeper
      selection is editorial, not chronological.</p>` : ""}
    <p class="note">Cuts are snapped to measured silence and every segment is
    faded 20ms in and out, because several joins land in breath rather than true
    silence.</p>
    ${meas.straight || meas.mastered ? table(
      ["Version", { label: "LUFS", num: 1 }, { label: "LRA", num: 1 }, "Treatment"],
      [
        { cls: a.pick === "straight" ? "win" : "", cells: [
          { value: "straight" }, { value: num(meas.straight?.lufs, 1), num: 1 },
          { value: num(meas.straight?.lra, 1), num: 1 },
          { html: `pure gain ${meas.gainDb >= 0 ? "+" : ""}${num(meas.gainDb, 2)} dB` }] },
        { cls: a.pick === "mastered" ? "win" : "", cells: [
          { value: "mastered" }, { value: num(meas.mastered?.lufs, 1), num: 1 },
          { value: num(meas.mastered?.lra, 1), num: 1 },
          { html: "EQ, 1.4:1, limiter" }] },
      ]) : ""}
    ${a.pick ? `<p class="note">Shipped the <b>${esc(a.pick)}</b> version.${
      a.pick === "mastered" ? " The raw mic wins on tone, but that does not solve level: straight lands well under the &minus;14 platforms expect and gain alone cannot close it." : ""
    }</p>` : ""}`;
}

// --- 6. video --------------------------------------------------------------
function stageVideo() {
  if (!has(m.cards)) return empty("Add manifest.cards.");
  const verify = new Map((m.verify ?? []).map((v) => [v.id, v]));
  const anyLead = m.verify?.some((v) => v.voiceAt != null);
  return `
    <p class="note">The board renders at its own natural length, then each card
    is stretched or trimmed to the section spoken over it. <b>Holds only</b> &mdash;
    transitions always play at native speed, so this reads as an edit rather than
    a speed change, and the final card&rsquo;s drawer exit is carried separately
    so a freeze cannot eat it.</p>
    ${table(["Card", { label: "Cuts at", num: 1 }, { label: "Length", num: 1 },
             ...(anyLead ? [{ label: "Voice at", num: 1 }, { label: "Lead", num: 1 }] : [])],
      m.cards.map((c) => {
        const v = verify.get(c.id) ?? {};
        return { cells: [
          { value: c.id },
          { value: num(c.start), num: 1 },
          { value: num(c.end - c.start), num: 1 },
          ...(anyLead ? [
            { html: v.voiceAt == null ? "&mdash;" : num(v.voiceAt), num: 1 },
            { html: v.voiceAt == null ? "&mdash;" : `+${num(v.voiceAt - c.start)}`, num: 1, cls: "dim" },
          ] : []),
        ] };
      }))}
    ${anyLead ? `<p class="note">Lead is positive on every card, which is the
      direction to want: the board turns, then the line arrives. Measured by
      transcribing the finished file, not by eye.</p>` : ""}`;
}

// --- 7. publish ------------------------------------------------------------
function stagePublish() {
  const p = m.publish ?? {};
  const o = m.outputs ?? {};
  const links = has(p.links)
    ? `<div class="links">${p.links.map((l) => `<a class="link" href="${esc(l.url)}">
        <span class="where">${esc(l.platform)}</span><span class="go">OPEN &rarr;</span>
        <span class="detail">${esc(l.detail ?? "")}</span></a>`).join("")}</div>`
    : empty("Add manifest.publish.links once it is live.");
  const cap = (title, body) => body
    ? `<p class="note"><b>${esc(title)}</b></p><div class="caption-block">${esc(body)}</div>` : "";
  return `${links}
    ${cap("Instagram and Facebook", p.caption)}
    ${cap("YouTube title", p.youtubeTitle)}
    ${cap("YouTube description", p.youtubeDescription)}
    ${o.sizeMb ? `<p class="note">Delivered at <b>${num(o.sizeMb, 1)}&nbsp;MB</b>,
      ${num(o.duration)}s. Encode for delivery at CRF ~24; a CRF 18 master of
      this length fails Facebook outright.</p>` : ""}`;
}

// --- assemble --------------------------------------------------------------
const STAGES = [
  { n: "01", title: "Results and media", what: "both arrive from the event", body: stageResults },
  { n: "02", title: "Script", what: "written off the times", body: stageScript },
  { n: "03", title: "Clip layout", what: "a clip against each block", body: stageLayout },
  { n: "04", title: "Record", what: "read the script", body: stageRecord },
  { n: "05", title: "Audio edit", what: "flubs out", body: stageAudio },
  { n: "06", title: "Video edit", what: "picture cut to the voice", body: stageVideo },
  { n: "07", title: "Publish", what: "out the door", body: stagePublish },
].map((s) => ({ ...s, html: s.body() }));

/**
 * The Apex token layer, emitted as custom properties straight from
 * @oio/tokens. Nothing below re-derives a brand value: the stylesheet only ever
 * refers to these names, so a token change lands here and nowhere else.
 *
 * SINGLE THEME, ON PURPOSE. Apex is a dark brand — every surface it defines
 * (base.surface, base.surface2, base.line) is dark, and there are no light-mode
 * equivalents. Following the viewer's light preference would mean inventing a
 * light ground and hairline, which is precisely the re-derivation the repo
 * forbids. So the page commits to the brand's own ground in both preferences
 * and declares `color-scheme: dark` so the browser's own furniture agrees.
 *
 * If a light variant is ever wanted, the fix is to add light surfaces to
 * tokens.json, not to guess two hexes here.
 */
function tokenLayer(t) {
  const c = t.color;
  const scale = Object.entries(t.type.scale).map(([k, v]) => `    --oio-text-${k}: ${v};`).join("\n");
  const font = (name) => t.type.fonts[name].stack
    .map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");
  // Tokens name the label colours as words; map them through the palette so the
  // page never states a hex the token file did not.
  const pick = (word) => (word === "white" ? c.base.white : c.base.black);
  const l = t.cornerLabel.onDark;
  const box = { bg: pick(l.boxBg), fg: pick(l.boxColor), plain: pick(l.plainColor) };
  const h = t.type.heading;
  if (h.font !== "helvetica") throw new Error(`type.heading.font is ${h.font}; the stylesheet binds --oio-sans`);

  return `:root {
    color-scheme: dark;

    /* palette */
    --oio-black: ${c.base.black};
    --oio-white: ${c.base.white};
    --oio-surface: ${c.base.surface};
    --oio-surface-2: ${c.base.surface2};
    --oio-line-dark: ${c.base.line};
    --oio-muted: ${c.base.muted};
    --oio-muted-2: ${c.base.muted2};
    --oio-spark: ${c.core.spark.ramp[500]};

    /* Type. condensedBlack is deliberately not surfaced: tokens flag it as
       orphaned for hero punch, and it is not among the faces this repo ships,
       so exposing it would only invite a silent fallback. */
    --oio-sans: ${font("helvetica")};
    --oio-mono: ${font("mono")};
${scale}

    /* page heading, locked in type.heading */
    --oio-heading-weight: ${h.weight};
    --oio-heading-tracking: ${h.letterSpacing};
    --oio-heading-leading: ${h.lineHeight};
    --oio-heading-size: clamp(var(--oio-text-${h.sizeMin}), ${h.sizePreferred}, var(--oio-text-${h.sizeMax}));

    /* shape and measure */
    --oio-radius: ${t.shape.radius.none};
    --oio-sheet-max: ${t.spacing.sheetMaxWidth};
    --oio-label-pad: ${t.cornerLabel.partPadding};
    --oio-label-weight: ${t.cornerLabel.partFontWeight};

    /* roles, bound to the brand's own ground */
    --ground: var(--oio-surface);
    --raised: var(--oio-surface-2);
    --line: var(--oio-line-dark);
    --ink: var(--oio-white);
    --muted: var(--oio-muted);
    --muted-2: var(--oio-muted-2);
    --accent: var(--oio-spark);
    --box-bg: ${box.bg};
    --box-fg: ${box.fg};
    --box-plain: ${box.plain};
  }`;
}

const components = await fs.readFile(new URL("./recap-artifact.css", import.meta.url), "utf-8");
const css = `${tokenLayer(tokens)}\n\n${components}`;
const ev = m.event ?? {};
const runtime = m.outputs?.duration;
const html = `<title>${esc(ev.name ?? "Recap")} — build record</title>

<style>
${css}</style>

<div class="wrap">
  <header>
    <div class="plate"><span class="fact">${esc([ev.name, ev.class].filter(Boolean).join(" · ").toUpperCase())}</span>${
      ev.date ? `<span class="name">${esc(ev.date)}</span>` : ""}</div>
    <h1>${esc(ev.name ?? "Recap")}, build record</h1>
    <p class="standfirst">${
      runtime ? `Finished cut runs <b>${Math.floor(runtime / 60)}:${String(Math.round(runtime % 60)).padStart(2, "0")}</b>. ` : ""
    }Below is the build in the order it actually happened, which is the order the
    job runs every time.</p>
  </header>

  <nav><ol>${STAGES.map((s) =>
    `<li><a href="#s${s.n}"><b>${s.n.replace(/^0/, "")}</b> ${esc(s.title)}</a></li>`).join("")}</ol></nav>

${STAGES.map((s) => `  <section class="stage" id="s${s.n}">
    <h2><span class="n">${s.n}</span> ${esc(s.title)} <span class="what">${esc(s.what)}</span></h2>
${s.html}
  </section>`).join("\n\n")}

  <footer><p>Generated from the job manifest by
  <code>scripts/recap-artifact.mjs</code>. One section per stage, in the order
  the stages run.</p></footer>
</div>
`;

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, html);

const bare = STAGES.filter((s) => s.html.includes('class="note empty"'));
console.log(`wrote ${out}`);
console.log(`  ${STAGES.length - bare.length}/${STAGES.length} stages have data`);
for (const s of bare) console.log(`    ${s.n} ${s.title}: nothing recorded`);

m.outputs = { ...(m.outputs ?? {}), artifact: path.relative(m.__dir, out) };
await saveManifest(m);
