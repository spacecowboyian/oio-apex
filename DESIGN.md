# Apex — design system

The visual system for OIO Racing. This file is the **map**; the authority is
`packages/tokens/tokens.json`, which carries both the values and most of the
rules as prose. Nothing downstream re-derives a colour, type step or spacing
value — read the token file.

Companion documents:

| file | what it is |
|---|---|
| `packages/tokens/tokens.json` | **authority.** Values + rules. Read this first. |
| `oio-apex-brand-guide.html` | the visual guide, section by section |
| `HANDOFF.md` | decisions and the *why* behind them, dated |
| `packages/video/README.md` | leaderboard data contract, caption rules |

Style name: **Apex**. "Grit going in, spark coming out."

## The system in one page

**Apex is a dark brand.** Every surface it defines is dark; there are no
light-mode equivalents. A surface that needs to render light has to add light
tokens to `tokens.json` first — do not invent a ground and a hairline locally.
That is the single most common way this system gets diluted.

### Colour

Two mood cores, picked one at a time, never both as co-headline:

- **Spark** `#F5C200` — payoff, victory. Spend it on the thing that *is* the
  payoff, not on chrome. A page with spark on its section numbers has no colour
  left for its result.
- **Grit** `#D2301E` — struggle, mechanical.

Support colours are not mood picks: **Rust** `#E07020` is vintage/patina only,
**Flag** `#4C9F45` is confirmation/pricing signal only.

Grounds are `base.surface` `#161412` and `base.surface2` `#1e1b18`, hairlines
`base.line` `#3a342c`.

**Contrast is documented, not assumed.** `color.contrast` in the token file
records what each value can actually carry, measured. The headline constraint:

- Body and secondary text → `base.muted` `#9a9083` (5.85:1 on surface)
- `base.muted2` `#6b6355` is **large text only** — 3.10:1 on surface, and
  2.89:1 on surface2, which fails even the large-text bar. Do not put it on the
  raised surface at all. It was documented as "secondary/muted body text" until
  2026-07-28 and could never carry that.
- `base.line` is 1.49:1. Hairlines only, never text or a meaning-carrying icon.

### Type

One scale, twelve rem steps, `caption` through `heroXl`, ~1.25 ratio. Every
size is one of those steps; nothing is picked ad hoc. Fluid sizes clamp
*between two named steps* rather than inventing values in between.

- **Helvetica** — lead, body, and display.
- **Helvetica Neue Condensed Black** — corner-label numerals and leaderboard
  digits only. The display/punch role was retired 2026-07-28.
- **SignPainter** — vintage script, hero sizes only.
- **Mono** — tabular numerals and codes. Anything with digits that line up in a
  column takes `font-variant-numeric: tabular-nums`.

**Never italic.** Not for emphasis, not for an aside, not for an empty state.
Weight and colour carry emphasis. Worth enforcing with a
`:where(i, em, cite) { font-style: normal }` backstop, since markdown and
pasted copy reintroduce it constantly.

**Page headings** (`type.heading`): all caps, wide Helvetica Bold, weight 700,
`+0.01em` tracking, `1.04` leading, balanced wrap, `clamp(h3, 7vw, h1)`.
Tracking is positive — tightening it pulls back toward the condensed look the
hero decision rejected. Distinct from the two-tier thumbnail hero lockup.

**A font not shipped as a file does not exist.** Renders happen in headless
Chrome, which cannot see macOS system fonts, so declaring an uninstalled face
looks correct on a designer's Mac and silently falls back everywhere real.
Check `packages/tokens/fonts/` before reaching for a face. This has already put
off-brand text on a published reel once.

### Shape

**Square corners.** Every box, label, card, pill and button is a hard right
angle. The circle brand system is the only exception, and it is fully round,
never partially. Apply `--radius: 0` explicitly rather than omitting
`border-radius`, so a later tidy-up cannot round it.

### The corner label

The system's signature device, and the grammar to extend when a new component
needs structure: **two flush parts, left boxed, right plain.** The box sits on
the outer frame edge and **contrasts with its own ground** — white box on a
dark shot, black box on a light one. The plain side matches the frame.

Left is the fact, right is the name or sub-fact. **Always all caps**, enforced
in the renderers rather than left to callers, and applied before text
measurement since the box is sized from the measured string and caps are wider.

Numbered section headings reuse this: a mono marker in a corner-label box plus
the title. New on-screen furniture should extend this grammar rather than
invent a device.

### The circle

Solid fill, never an outlined ring. Contrast-matched, not defaulted. Scales
from a single `--d`; optical centring is frozen as an em ratio per glyph so it
scales rather than being re-tuned per size.

## Audit findings, 2026-07-28

Run with impeccable v4.0.1 against the recap build-record page and the token
set. Fixed unless noted.

| # | dimension | finding | resolution |
|---|---|---|---|
| 1 | a11y | `muted2` documented as body text, fails AA on every ground | role corrected in tokens and guide; `color.contrast` added |
| 2 | a11y | no `<main>` landmark; nav and sections unlabelled | `<main>`, `aria-label`, `aria-labelledby` added |
| 3 | responsive | nav touch targets 29px | `min-height: 44px` |
| 4 | responsive | 202px overflow at 200% text zoom | `minmax(min(17rem, 100%), 1fr)` — a bare rem minimum cannot shrink when the root font grows |
| 5 | responsive | nowrap chip in an `auto` grid track pushed past the viewport | stacks below `30rem`; a rem breakpoint covers narrow phones *and* zoomed text in one rule |
| 6 | theming | — | clean: every hex traces to `tokens.json`, verified programmatically |
| 7 | integrity | — | clean: detector reports no findings |

Two of these were **system-level, not page-level**: the `muted2` role was wrong
in the brand itself, and any surface that followed the guide would have
inherited the failure.

## Known gaps

- **No `PRODUCT.md`.** Impeccable's context tool blocks `shape`/`init` flows on
  this. Refinement commands proceed without it.
- **No light mode.** Deliberate, see above. Adding one means adding tokens.
- **Voice & tone** (guide section 07) was never written. Caption voice lives in
  Brains and in `.claude/skills/oio-social-post/`.
- `spark.ramp.700` is 4.46:1 on `surface2` — clears AA on the ground, just
  misses it on the raised surface. Avoid it for small text on panels.
