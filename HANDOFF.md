# OIO Apex Brand Guide — handoff notes

Working file: `oio-apex-brand-guide.html` (single-file, inline CSS, no build step).
Status: draft, still being worked out — **not yet saved to Brains**. Don't push to Brains until told it's final.

## Decisions locked in so far

**Style name:** Apex. "Grit going in, spark coming out."

**Color:**
- Core (pick one by mood): Spark `#F5C200` yellow (payoff/victory), Grit `#D2301E` red (struggle/mechanical, used to be orange)
- Support: Rust `#E07020` orange (vintage/patina only, not a mood pick), Flag `#4C9F45` green (confirmation/pricing signal only, not a mood pick — per Impeccable's own semantic-color guidance)
- Full 5-step tint/shade ramps defined per color as CSS custom properties

**Type scale:** one prescriptive rem-based system, custom properties `--size-caption` through `--size-hero-xl`, named after HTML elements up to h1 then `hero-sm/md/lg/xl` beyond. ~1.25 ratio, hand-rounded.

**Fonts (type suite):**
- Helvetica — lead/body, full size range
- Helvetica Neue Condensed Black — display/punch only, never below H2, no italic ever
- SignPainter — vintage script, hero sizes only (120–160px), flat color only (no gradient/outline/drop-shadow — tried that once, rejected as "garbage")

**Corner labels (`.corner-label`):** flexbox, two divs, no gap (flush). Left = fact (year/make/model or event category), right = name/sub-fact. The **box always sits on the outer edge** (whichever side is anchored to the frame edge) and always contrasts with its own frame — white box on a dark shot, black box on a light shot. The plain (unboxed) side just matches the frame color. Confirmed against real footage in `~/Downloads/thumbexamples`, not assumed.

**Hero text (two-tier headline):** setup line + punch line. **Never italic** (checked every real thumbnail — none are italic). Reworked 2026-07-16 to match `refs/thumbexamples` (6 real thumbnails):
- **A translucent black box carries the text** (`rgba(0,0,0,0.72)`) — the signature move, present in 5 of 6 real thumbnails. Same box aesthetic as the section-04 corner labels.
- **Both tiers are ONE heavy face split by colour**, not two different fonts. The face is the **wide Helvetica Bold/Black cut** — decided over the narrow Condensed Black (the footage reads wide, not condensed). One line white, one line the mood accent.
- **Font decision open item:** hero punch is now wide-bold Helvetica, so **Condensed Black may be orphaned** in the type suite (section 03 still lists it as "display/punch"). Revisit whether Condensed Black keeps a role or gets cut.
- **Widths match: first row = second row.** Size each line so the two rendered widths match; not a fixed small/large ratio. A **connector circle in the top row counts toward that row's width** (e.g. "ALIVE" is sized to match "DEAD" + the "or" circle). Verify by measuring actual rendered text width, not container width (flex `align-items: stretch` silently breaks this if the lines are block-level flex children).
- **Section 05 shows the accent filling the whole frame** (type treatment at full size) — glyph sizes are container-query units (`cqw`) on a `container-type: size` frame, so each accent fills ~100% height and both rows fill to equal width (the width-match holds automatically at any cell size). Real corner / over-photo *placement* is section 06's job, not 05's.
- **Vintage lockup is now a reusable, z-index-layered pattern** (matched to `refs/thumbexamples` #5), which fully reverses the earlier "flat colour, no gradient/outline/shadow — rejected as garbage" rule. Classes inside `.vin-stack` (the positioning context), back → front:
  - `.vin-back` (z 0) — SignPainter word, black `-webkit-text-stroke` outline + `text-shadow` glow
  - `.hero-vin-chip` (z 1) — the tab (e.g. red REDLINE on a rounded black tab), `position: absolute`
  - `.vin-front` (z 2) — same word again, gold vertical-gradient fill via `background-clip: text`
  The **layer order is the reusable part**; the tab's `top`/`left` are set **per word-set** (nudge to fit the specific two words — there is no universal ratio, per Ian). Two-copy script is what lets one word carry both a solid outline and a gradient fill. (Ian asked to match the thumbnail; this intentionally overrides the old flat-fill rule. Revert to flat Spark + outline-only if disliked.)

**Logo & Badge:** Helvetica Bold wordmark, tight tracking, no circle/frame. Badge is solid fill only, never an outlined ring.

**The circle (brand system):** The OIO badge is one instance of a broader rule — the **solid circle is a core brand shape**. It carries the wordmark, connector words (or / vs / to), an ampersand, or a number. Always solid fill, never an outlined ring (same rule as the badge). White-on-black default; invert (black circle) only on light surfaces. Lives in section 01.
- **Scale as one unit, don't re-tune.** The circle is driven by a single `--d` (diameter) custom property on `.circle-el`: circle size, glyph font-size (fraction of `--d`), and the optical-centring offset all derive from it. To resize, change `--d` only — never adjust text/padding/line-height per size.
- **Optical centring is frozen as an em ratio** per glyph (`--cy` on the inner `<span>`): wordmark −0.0175em, connector −0.118em, ampersand −0.0185em, number −0.0203em. These were measured once from the real Helvetica ink box (via canvas `actualBoundingBox`) then baked in; because they're em-relative they scale with the glyph. (An earlier runtime canvas script did this live but was removed once the values were correct — the whole point is get-it-right-once-then-scale.)
- **Logo lockup proportion = OIO at 0.36·diameter** (generous padding, per Ian's reference). Applied consistently to every OIO-in-circle mark: circle-system wordmark (`0.36·--d`), section-01 badge-demo (1.62rem/72px), masthead ring (0.77rem/34px), layout-diagram ring (0.68rem/30px). Other circle glyphs: connector 0.533, ampersand 0.689, number 0.644.

**Vehicle Naming section:** removed entirely (was section 06, now gone).

**Section order:** 01 Logo & Badge, 02 Color, 03 Typography, 04 Corner Labels, 05 Hero Text, 06 Layout & Composition, 07 Voice & Tone.

## Tooling

- Impeccable skill is installed project-locally (`.claude/skills/impeccable`). Helvetica is registered as a confirmed exception to its `overused-font` rule (`.impeccable/config.json`) — don't let it re-flag or swap the font.
- Verify visual changes by actually loading the file, not by reading the CSS and assuming — several real bugs this session only showed up under live measurement (flex-stretch breaking width comparisons, focus-visible selectors only working on the last of several siblings, missing `<meta charset>` making em-dashes render as `â€"` over HTTP, etc.).
- **Hot-reload dev server:** `python3 dev-server.py 8752` (zero-dependency, in repo) serves the guide at `http://localhost:8752/oio-apex-brand-guide.html` and auto-reloads the browser on save. `live-server` via npx is broken here (missing `debug` dep).
