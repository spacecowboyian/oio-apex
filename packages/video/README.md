# OIO video components

Remotion + Storybook, driven by `tokens.json` (brand colors/type/spacing —
see repo-root `oio-apex-brand-guide.html` and `HANDOFF.md` for the source of
truth those were extracted from).

**Commands**: `npm run dev` / `npx remotion studio` to preview, `npm run
storybook` for the component catalog, `npx remotion render` /
`npx remotion still` to export (see below for the leaderboard-specific
recipe).

## Leaderboard

One component (`src/leaderboard/Leaderboard.tsx`) renders every event type
(track/autocross/rallycross) and every roster size. Adding a new leaderboard
is a **data-only** change — no code, no new components, no touching
`Root.tsx` or Storybook.

### The data contract

A leaderboard is one JSON object matching `LeaderboardConfig`
(`src/leaderboard/types.ts`) — a **discriminated union on `eventType`**, so
each event type's `racers` carry exactly the fields that event actually has,
no more:

```json
{
  "eventType": "autocross",
  "title": "FIT OFF COMPETITORS",
  "highlightMode": "manual",
  "featured": ["Ian Jennings"],
  "racers": [
    { "name": "Ian Jennings", "car": "2009 Honda Fit Sport", "runs": [43.351, 43.448, 44.315, 42.978, 44.203, 43.094, 44.133, 44.608, 42.881, 42.881] },
    { "name": "Hudson Smith", "car": "2009 Honda Fit Sport", "runs": [44.879, 43.293, 43.720, 43.761, 44.462, 44.577, 44.873, 44.377, 43.355, 43.910] }
  ]
}
```

- **`eventType`**: `"track"` | `"autocross"` | `"rallycross"` — picks both the
  row layout and the shape `racers` must be:
  - `track` → `TrackRacer` — `{ pos, name, car, gap }`. Track events run
    **laps**, not runs — there's no `runs` array here, and `pos` **is**
    data (there's no time-based stat to derive standings from).
  - `autocross` → `RunRacer` — `{ name, car, runs }`. `runs` is every run so
    far, **oldest first, as raw seconds** (`45.678`, not `"45.678"` or
    `"0:45.678"` — whatever a timing system actually outputs). The component
    derives "last" (the final element), "fastest" (the minimum), the
    on-screen `M:SS.mmm` formatting, **and standings** — don't pre-compute or
    pre-format any of those, and don't supply a `pos`.
  - `rallycross` → `RallycrossRacer` — `RunRacer` **plus** `total` (raw
    seconds) — the cumulative time across all runs, which is what rallycross
    actually ranks by and what its results provide. `runs` is the same "run"
    concept as autocross, just with `total` added on top.
- **`highlightMode`**: `"leader"` auto-highlights P1 (yellow row, no `featured`
  needed). `"manual"` highlights exactly the racer names listed in `featured`
  — the leader is **not** auto-highlighted in this mode.
- **`featured`**: array of racer `name`s, only read when `highlightMode` is
  `"manual"`.
- **`title`**: optional context row locked to the top of the board ("what am
  I looking at" — a single class, the whole field, OIO drivers vs. the rest,
  etc). Omit it (or set explicitly to `null`) for no title.
- **`racers`**: the roster, in **any order** — for autocross/rallycross,
  standings are computed from `runs`/`total`, not read from the array order
  or a `pos` field (there isn't one to supply). `name` is the real full name
  (e.g. `"Ian Jennings"`) — that's what `featured` matches against. The
  component displays it as "First L." (`"Ian J."`); it never reformats the
  underlying data.

### Standings are computed, never supplied (autocross/rallycross)

`pos` isn't part of the autocross/rallycross data contract at all — a
results-import script should never try to compute or guess it. Every render,
`src/leaderboard/runProgress.ts`'s `deriveStandings` sorts the roster (by
`fastestOf(runs)` for autocross, by `total` for rallycross) and assigns
`pos` fresh. This is also what makes `throughRun` snapshots correct: standings
during the event genuinely differ from the final result, and re-deriving
from a slice of `runs` is the only way to get that right.

This is the format for **any** future results-import tooling — a script that
converts a timing export into a `LeaderboardConfig` JSON can feed straight
into rendering with no other glue code. Vocabulary note for that script: a
single timed attempt is a **lap** at a track event, a **run** at autocross
and rallycross — field names follow that (`runs`, not `laps`, for the
run-based events). See `src/leaderboard/time.ts` for the derivation
(`fastestOf`/`lastOf`/`formatRunTime`) and `src/leaderboard/format.ts` for
the display-name formatting.

### Row color: two independent flags, not one state

Every row carries `{ featured, fastest }` (`RowState` in
`LeaderboardShell.tsx`), computed independently — they're not mutually
exclusive:
- **`featured`** (yellow) — set explicitly via `highlightMode`. Always wins
  for the row's ambient background; black text, inverted (black) rank circle.
- **`fastest`** (green) — whoever currently holds the best single run/lap in
  the field, regardless of standings or featured status. A non-featured
  racer can (and often will) hold this — their whole row goes solid dark
  green (white text, standard white rank circle) with no other break.
- **Both at once** — a featured racer who's also currently fastest keeps
  their yellow row, but their fast/total cell gets its own lighter-green
  accent (black text) as a visible "and they're fastest" callout inside the
  featured row.
- **Neither** — normal; the endcap column gets the muted dark-gray treatment
  to still read as a distinct block.

Track has no runs concept, so `fastest` is always `false` there.

### Layout — automatic, not configured

Every board is full-bleed to the bottom-left corner of the frame — no margin,
flush against both edges. `src/leaderboard/layout.ts` decides sizing from
`racers.length` alone:
- **Compact**: bottom-anchored card, grows as racers are added.
- **Locked**: once the roster would run past the frame's height, the board
  locks edge-to-edge — exactly top-of-frame to bottom-of-frame, rows stretched
  slightly so there's never a leftover gap from integer row-count rounding —
  and the rest scrolls underneath instead of the card growing further.
  - **Nobody featured is visible at the starting (bottom) window** — either
    `highlightMode: "leader"` (nothing is ever "featured" there) or `"manual"`
    with no featured racer that low in the standings — skips the hold
    entirely and starts scrolling immediately toward the top. We don't care
    who's at the bottom unless a featured racer is actually down there.
  - Otherwise (`"manual"` with a featured racer at/near the bottom): holds 4s
    there first, then scrolls up, holding 4s on each subsequent featured
    racer, ending at the top.

There's nothing to set for this — it's computed from the data every time.

### Generating a run-by-run update (`throughRun`)

Every racer's `runs` array holds every run so far — the standings for "as of
right now" are a **view**, not separately-stored data. Pass `throughRun: N`
(1-based) and the component slices every racer's `runs` down to the first
`N` and recomputes standings (`pos`) from that slice — assumes everyone has
completed the same number of runs at each checkpoint (true for a standard
heat/round structure). Omit `throughRun` (or leave it `null`) for the
final/complete result. Track has no runs concept and ignores it.

This is what makes "show the update after ALEX's 7th run" a one-line prop,
not a second config file — see `src/leaderboard/runProgress.ts`.

Whenever the board is showing a specific run rather than the complete result
(autocross/rallycross, `finalResults` off), the title bar's right edge shows
which one — `"RUN 2"`, or `"FINAL"` once `throughRun` is omitted. Track and
`finalResults` boards never show it (see `runLabel` in
`src/leaderboard/LeaderboardShell.tsx`).

### Position-change "camera follow" (`previousThroughRun`)

A one-time animated transition instead of a static board: set
`previousThroughRun: N` alongside `throughRun` (or omit `throughRun` to
animate up to the final result) and the board holds on standings as of run
`N`, then **each `featured` racer moves one at a time** — bottom-placed
first — sliding to their `throughRun`/final standing while the camera tracks
just them, clamping at the top/bottom of the board once there's nowhere left
to scroll (so a big jump keeps sliding *within* the viewport once the list
itself can't scroll any further), then holds before the next racer's move
starts. Animating one racer per step (rather than the whole field
simultaneously) is what keeps every featured racer's move clearly visible —
with everyone moving at once, the camera can only center on one of them and
the rest happen off-screen. Stat/rank text crossfades — old value fading
out, new value fading in — timed to the same slide, instead of an instant
swap; the title bar's run label crossfades too, partway through the overall
sequence. Bystander rows that get displaced by a passing racer dim briefly
while they shift, so a mover crossing past 1-2 people doesn't read as
overlapping text. Only meaningful for autocross/rallycross with at least one
`featured` name; ignored for track, `finalResults`, or with an empty
`featured` list. See `derivePositionSequence` in
`src/leaderboard/runProgress.ts` and the `positionTransition` branch of
`LeaderboardShell.tsx`. Timing constants
(`POSITION_TRANSITION_HOLD_SECONDS`/`_SLIDE_SECONDS`, one hold+slide per
mover) live in `layout.ts`.

### Final-results table (`finalResults`)

A completely different, minimal presentation for the same data: set
`finalResults: true` and the board renders as two plain columns — name/car
and one final-result number (fastest run for autocross, total for
rallycross, gap for track) — with **no rank circle** and no run-label
(showing the final tally is the whole point), sized only as wide as those
two columns need. It's meant to run in a corner with video footage playing
unobstructed beside/behind it. Same grow-then-lock-and-scroll sizing as the
standard board. See `src/leaderboard/finalResultsCells.tsx`.

`finalResultsScope` (only meaningful alongside `finalResults`) picks how much
of the roster to show:
- `"all"` (default) — the whole field, as above.
- `"featured"` — narrows to just the class winner plus whichever racers are
  in `featured`. At that size, position is meaningful again, so the rank
  circle comes back too (the only place it appears in final-results mode).

### Two ways to pass data in (pick whichever is convenient)

`LeaderboardComposition` accepts either:
1. **A full `config`** — `{ config: { eventType, ..., racers } }`. Wins
   outright over the individual fields below if both are present.
2. **The individual fields directly** — `{ eventType, title, highlightMode,
   featured, racers }` as top-level props.

Config JSON files in `leaderboard-configs/*.json` are written unwrapped
(shape 2) — this is what makes them droppable straight into `--props` (see
below) with no wrapper key.

### Previewing

- **Storybook** (`npm run storybook`, already running at localhost:6006):
  "Video/Race Leaderboard" → **Playground** is the generator — a dedicated
  control for every field (`eventType`/`highlightMode` as selects, `title` as
  text, `featured`/`racers` as editable arrays), a `config` control that
  overrides all of them at once if you want to paste in a whole object, and
  a row of **Run 1 / Run 2 / ... / Final** buttons (`throughRun`) that
  regenerate the standings as of that run — the component does the
  recomputation, nothing to prepare by hand. A `dataset` radio (manual /
  short / medium / long) picks where `racers` comes from: `"manual"` uses the
  `racers` control as edited; short/medium/long (autocross/rallycross only)
  generate a fresh seeded-random roster instead (`src/leaderboard/fakeData.ts`)
  — 5/9/16 racers with 3/6/9 runs each respectively, so both roster size and
  run count scale with the tier — `"long"` always overflows into the
  scrolling board, useful for eyeballing overflow behavior without hand-
  editing a big `racers` array. This is for occasional manual
  use; the primary workflow (an agent writing a config JSON and rendering it)
  doesn't need this UI at all — it just sets `throughRun` directly in the
  JSON or `--props`. Static by default (toggle `autoPlay` to see the
  animation). Below
  Playground are fixed example stories, one per file in
  `leaderboard-configs/`. Playground shows three things side by side: an
  **"Export runs" panel** on the far left (see below), then the **full
  roster** — every racer, no animation, no scroll clipping, just the
  complete data at a glance (`src/leaderboard/StaticPreview.tsx`) — and two
  small "monitor" windows on the right, both composited over the working
  reference photo (`public/betty-datsun-521.png`, Storybook-only — see
  below): **Final state** is frozen on the settled result, **Live preview**
  plays the real animation (`autoPlay` toggles whether it starts playing
  automatically). The fixed example stories below Playground get the same
  photo backdrop.
- **Remotion Studio** (`npx remotion studio`): the "Leaderboard" composition
  uses `leaderboard-configs/track.json` as its default props.

### Batch-exporting clips from Storybook

Playground's **"Export runs" panel** (far left) lists Run 1, Run 2, ...,
Final — checkboxes, a select-all/none toggle at the top, and a **Generate**
button — and renders whichever are checked as transparent-background ProRes
4444 `.mov` files, using whatever's currently dialed into every other
Playground control. Click Generate, choose a save folder (a native macOS
dialog), and it renders straight there — ready to drop into an editor.

This needs the local render server running alongside Storybook:

```
npm run render-server
```

(`scripts/render-server.mjs` — bundles the project once per batch and calls
`@remotion/renderer` directly, same codec/pixel-format recipe as the CLI
commands below.) The panel component itself
(`src/dev-tools/RenderQueuePanel.tsx`) and the server are both intentionally
generic — not leaderboard-specific — since every video component in this
project is going to need some way to batch-export its variants as clips.
Reuse them: pass a new component's own `compositionId` and whatever list of
`{id, label, filename, props}` jobs makes sense for it (the leaderboard's
"jobs" happen to be run snapshots; another component's might be its fixed
example variants, or something else entirely).

**The photo is preview-only, never part of the render.** `LeaderboardComposition`
is transparent everywhere except the board itself — that's what makes the PNG
sequence / alpha QuickTime exports below drop straight into an editor as an
overlay track over real footage. The truck-and-trailer reference photo you see
behind it in Storybook is composited on in the *story* (`VideoWindow` in
`Leaderboard.stories.tsx`), purely so a board can be eyeballed against
something photo-realistic while developing — it's never baked into what
Remotion actually renders.

### Rendering for use in a video

No code changes needed — write a config JSON, then:

```
# PNG sequence (drops into free DaVinci Resolve as an overlay track, no keying needed)
npx remotion render src/index.ts Leaderboard out/my-board --sequence --props=./leaderboard-configs/my-board.json

# Alpha-channel QuickTime (also drops straight into Resolve)
npx remotion render src/index.ts Leaderboard out/my-board.mov --codec=prores --pixel-format=yuva444p10le --props=./leaderboard-configs/my-board.json

# Flattened MP4 (no transparency, simplest to preview)
npx remotion render src/index.ts Leaderboard out/my-board.mp4 --props=./leaderboard-configs/my-board.json

# Single still frame
npx remotion still src/index.ts Leaderboard out/my-board.png --props=./leaderboard-configs/my-board.json --frame=60
```

Duration is computed automatically from the config (`calculateMetadata` in
`Root.tsx`) — compact boards get a short settle-in beat, locked/scrolling
boards get however long the hold/scroll sequence actually takes.

**Gotcha:** `--props` (and the Studio/Storybook props panels) shallow-merge
over `defaultProps` — a config that *omits* an optional key (like `title`)
will inherit whatever `defaultProps` happened to have for that key, rather
than clearing it. If you want to guarantee no title, pass `"title": null`
explicitly rather than leaving the key out. `Root.tsx`'s default config
(`track.json`) has no optional fields set for exactly this reason.

### File map

- `types.ts` — the data contract (`LeaderboardConfig`, `RacerRecord`).
- `layout.ts` — auto-sizing (`computeLayout`), scroll stops
  (`computeScrollStops`), duration (`computeDuration`). Pure functions, no
  React.
- `rowCells.tsx` — per-`eventType` row renderers.
- `LeaderboardShell.tsx` — the shared row/animation/scroll/title mechanics
  every event type rides on. Flexbox rows with fixed-width columns (declared
  per cell via `Cell.width`), not a `<table>` — see the file's top comment
  for why.
- `Leaderboard.tsx` — ties it all together; `resolveConfig` implements the
  "full config vs. individual fields" merge.
- `StaticPreview.tsx` — Storybook-only: a plain, complete, non-animated
  rendering of every racer, reusing the same row-cell renderers/colors as
  `LeaderboardShell` so it stays visually identical. Not part of the render
  pipeline.
- `Leaderboard.stories.tsx` — Storybook stories.
- `fakeData.ts` — seeded-random roster generator for the Playground's
  `dataset` control (short/medium/long). Not used by any fixed example or
  the render pipeline.
- `leaderboard-configs/*.json` — example configs, also usable directly for
  `--props`.

`src/dev-tools/RenderQueuePanel.tsx` and `scripts/render-server.mjs` (project
root, not leaderboard-specific) — the reusable batch-export panel/server
pair. See "Batch-exporting clips from Storybook" above.

## Captions

Burned-in forced captions, all-caps in the brand's translucent-black box. One
command from a video to a captioned video:

```bash
node scripts/caption-video.mjs clip.mov out.mp4
node scripts/caption-video.mjs reel.mov out.mp4 --orientation tiktok
```

It transcribes with whisper (word-level timings — segment-level is far too
coarse to time a card against), groups the words into lines, picks one type
size for the whole set, renders each line as a transparent ProRes 4444 clip,
splices them into a single caption track, and burns that over the footage. Pass
`--transcript t.json` to reuse a transcript and skip whisper; `--keep-work` to
inspect the intermediate clips.

`--orientation` picks the platform safe area from `@oio/tokens`
(`landscape` | `vertical` | `instagramReels` | `tiktok` | `youtubeShorts`);
`auto` (the default) chooses landscape or vertical from the source's aspect.
The output is always the input's own frame size.

### What the rules are, and why

All of these are in `tokens.json` under `caption`, not in the code:

- **All-caps, hard cut, no fade.** Cards replace each other. Fading each one in
  and out reads as a stutter back to back.
- **One size per set.** `fitCaptionFontSize` takes every line at once and
  returns the largest step at which all of them fit. A size that changes card to
  card reads as a glitch, since nothing tells the viewer it carries no meaning.
- **Type is a fraction of frame width**, so a 1080-wide vertical master doesn't
  inherit a size authored for a 1620-wide one and shout.
- **Vertical lines cap at 12 characters** — a pace decision. It also happens to
  make the centred box narrow enough to clear the platforms' action rail, which
  is why vertical captions don't have to be shoved off to one side.
- **Nothing appears before it is spoken.** A card starts on its first word
  exactly. At a real pause it holds a second past its last word and then the
  screen goes blank until the next words begin.

### Gotchas worth knowing

- The card is `white-space: nowrap`. An over-long line is **clipped at the frame
  edge, not wrapped**, and nothing upstream notices — so every rendered clip is
  measured from its alpha channel and the run fails on overflow. Do not replace
  that check with a character-count estimate: all-caps runs ~10% wider than
  mixed case, which is exactly how a limit that measured fine in sentence case
  started overflowing by 32px.
- Transparent filler between cards needs `format=yuva444p10le` **inside the
  ffmpeg filter graph**, not just as the output `-pix_fmt`. The `color` source
  emits an opaque format, so `@0` alpha is dropped there and the later
  yuv->yuva conversion refills alpha at maximum — silently giving opaque black
  filler that blacks out the footage wherever nobody is talking.
- The safe-area numbers are measured off app screenshots at 1080x1920, not
  published specs, and these layouts move between app versions. Re-measure
  against a real post before trusting them.

### File map

- `scripts/caption-video.mjs` — the CLI and orchestrator. Bundles Remotion once
  for the whole set rather than shelling out per card.
- `scripts/caption-lines.mjs` — transcript to timed lines. No rendering, so it
  can be run and reasoned about alone: `node scripts/caption-lines.mjs
  transcript.json 12` prints the cards and the blanks.
- `scripts/caption-fit.mjs` — measurement against the real licensed Helvetica
  via `@napi-rs/canvas`, the size fit, and the per-frame character budget.
- `src/caption-card/` — the `CaptionCard` component itself.

## Foundations

`src/foundations/` — brand color ramps, type scale, font suite, and a real
`<CornerLabel />` component, all reading from `tokens.json`. See Storybook
"Foundations/*".
