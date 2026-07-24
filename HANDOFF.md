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

**Corner labels (`.corner-label`):** flexbox, two divs, no gap (flush). The **box always sits on the outer edge** (whichever side is anchored to the frame edge) and always contrasts with its own frame — white box on a dark shot, black box on a light shot. The plain (unboxed) side just matches the frame color. Confirmed against real footage in `~/Downloads/thumbexamples`, not assumed.

- **All-caps, always (locked 2026-07-23):** both halves of a corner label render in caps regardless of the casing a caller passes. Enforced in the renderers rather than by convention (`LowerThird.tsx`, which `EventDate`/`VenueTag` ride on; `CornerLabel.tsx`; `SocialLink.tsx`; `packages/social-card/src/card-draw.mjs`), and applied before any text measurement, since the box is sized from the measured string and caps are wider. **Why:** a mixed-case `82 Cressida / Ian` shipped on a reel before the rule was written down; leaving casing to whoever types the prop guarantees drift across hand-written props, config files and scripted renders.
- **Left = fact, sharpened 2026-07-18:** 2-digit year (no century, no make) + chassis code + model, all together when a chassis code exists and is enthusiast-recognized (`91 SW20 MR2`, `02 EK9 Civic`). No chassis code (ordinary econobox, no enthusiast code) → year + model only, no make (`91 Civic`, `98 Fit`). Year+model always paired — never drop one or the other.
- **Right = name/sub-fact, context-dependent:** race/event footage → driver name. Static/show footage → car's own name if it has one, else fall back to the owner's name if known. If neither a car name nor an owner is known, **omit the right side / skip the label entirely** rather than guessing or defaulting to make.

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

**The circle (brand system):** The OIO badge is one instance of a broader rule — the **solid circle is a core brand shape**. It carries the wordmark, connector words (or / vs / to), an ampersand, or a number. Always solid fill, never an outlined ring (same rule as the badge). **Contrast-matched, not defaulted (corrected 2026-07-18):** black circle + white text on light backgrounds, white circle + black text on dark backgrounds — neither is a default, pick whichever contrasts. **Why:** black circle/white text is what actually ships most (stickers, apparel, both usually on a light substrate), so it reads as familiar, but it's a light-surface contrast choice, not a hierarchy — the earlier "white-on-black default, invert only on light" framing implied one was the fallback, which isn't true and had gotten backwards in `BrandCircle.tsx`'s code (fixed same day). Lives in section 01.
- **Scale as one unit, don't re-tune.** The circle is driven by a single `--d` (diameter) custom property on `.circle-el`: circle size, glyph font-size (fraction of `--d`), and the optical-centring offset all derive from it. To resize, change `--d` only — never adjust text/padding/line-height per size.
- **Optical centring is frozen as an em ratio** per glyph (`--cy` on the inner `<span>`): wordmark −0.0175em, connector −0.118em, ampersand −0.0185em, number −0.0203em. These were measured once from the real Helvetica ink box (via canvas `actualBoundingBox`) then baked in; because they're em-relative they scale with the glyph. (An earlier runtime canvas script did this live but was removed once the values were correct — the whole point is get-it-right-once-then-scale.)
- **Logo lockup proportion = OIO at 0.36·diameter** (generous padding, per Ian's reference). Applied consistently to every OIO-in-circle mark: circle-system wordmark (`0.36·--d`), section-01 badge-demo (1.62rem/72px), masthead ring (0.77rem/34px), layout-diagram ring (0.68rem/30px). Other circle glyphs: connector 0.533, ampersand 0.689, number 0.644.

**Vehicle Naming section:** removed entirely (was section 06, now gone).

**Social post badge/corner-label size:** doubled 2026-07-18 per Ian — original figures (badge 96px, corner-label 30px, both at a 1080-wide export) read too small against real feed posts. Badge stayed doubled at 192px (`badgeDiameter: 17.8cqw`). Corner-label font-size was doubled too (60px) but that same day got walked back to 3.2cqw/cqh (~34px) — the doubled size clipped long real content ("1982 HONDA PRELUDE") into an ellipsis inside the 36cqw maxPartWidth box; 3.2cqw is the largest size that fits that real caption with no ellipsis, found via a Playwright binary search against the actual component render, not eyeballed. Canonical values live in `packages/tokens/tokens.json` (`@oio/tokens`) under `social` (`badgeDiameter`, `cornerLabelFontSize`, offsets unchanged at 2.22cqw/cqh) — `packages/video/src/social/SocialFrame.tsx`, `packages/social-card/src/render.mjs`, and the guide's section-06 zone-diagram all read from/mirror that.

**Section order:** 01 Logo & Badge, 02 Color, 03 Typography, 04 Corner Labels, 05 Hero Text, 06 Layout & Composition, 07 Voice & Tone.

**Square corners (locked 2026-07-18):** every box, label, card, and pill uses hard right-angle corners — no `border-radius`, formalizing a convention that was already implicit (info pills, corner labels never had rounding) but never written down. The circle brand system (badges, rank circles, connector marks, §"The circle" above) is the one exception — always fully round, never partially rounded. Buttons default to square too, unless a future decision says otherwise. Canonical value lives in `packages/tokens/tokens.json`'s `shape` token (`shape.radius.none`/`shape.radius.circle`); documented live in section 06's rules legend and in Storybook (`Foundations/Shape`, `packages/video/src/foundations/Shape.tsx`). NOTE: as of the 2026-07-19 monorepo migration, `tokens.json` does not actually contain a `shape` key even though `theme.ts` exports `tokens.shape` — a pre-existing data-model gap (tsc has been flagging it); add the `shape` block to tokens.json to close it.

## Tooling

- Impeccable skill is installed project-locally (`.claude/skills/impeccable`). Helvetica is registered as a confirmed exception to its `overused-font` rule (`.impeccable/config.json`) — don't let it re-flag or swap the font.
- Verify visual changes by actually loading the file, not by reading the CSS and assuming — several real bugs this session only showed up under live measurement (flex-stretch breaking width comparisons, focus-visible selectors only working on the last of several siblings, missing `<meta charset>` making em-dashes render as `â€"` over HTTP, etc.).
- **Hot-reload dev server:** `python3 dev-server.py 8752` (zero-dependency, in repo) serves the guide at `http://localhost:8752/oio-apex-brand-guide.html` and auto-reloads the browser on save. `live-server` via npx is broken here (missing `debug` dep).

## Monorepo migration + Chrome-free social-card renderer (2026-07-19)

Restructured into an npm-workspaces monorepo to make social posts fast and cheap without touching the video work:
- `packages/tokens/` (`@oio/tokens`) — single source of brand truth: `tokens.json` + the licensed Helvetica Neue faces + a small loader (`fontPath()`, named slices). Both other packages read from here; the old `video-components/tokens.json` was deleted so there's exactly one copy (kills the drift bug-class that had `tokens.json`, the brand-guide HTML, and the artifact disagreeing).
- `packages/video/` (`@oio/video`) — the Remotion project, moved verbatim from `video-components/`. `src/theme.ts` now imports `@oio/tokens/tokens.json`. Verified still bundles + renders after the move (byte-identical headless still output). Keeps Storybook + the video pipeline.
- `packages/social-card/` (`@oio/social-card`) — **the new default for posting.** A Chrome-free still renderer on `@napi-rs/canvas` that reads `@oio/tokens` and replicates `SocialFrame`/`CornerLabel`/`BrandCircle` exactly. ~250ms/card vs minutes; no `npm install` of Remotion, no 92MB Chrome-headless download, no Google-Fonts-TLS failure class. **Verified pixel-faithful** against the Remotion reference: 0.7% overall mean diff, badge + corner-label zones visually indistinguishable (residual is pure Skia-vs-Chrome text antialiasing). Remotion's `render-social-still.mjs` is kept as the fidelity *reference*, not the posting path.

Why: a fresh session was re-paying npm-install (26s) + Chrome download (~1 min) + Remotion bundle/render (minutes) per post, plus the whole headless-Chrome + public-host failure surface. The canvas package removes all of it. Ian's steer: "just make it as fast as possible, for me and lower tokens." Renderer swap + monorepo split were both his explicit calls (2026-07-19). Publish path stays Upload-Post (his call); catbox.moe is dead (412), tmpfiles.org is the current host, extraction baked into `packages/social-card/src/upload.mjs`.

Pre-existing gap surfaced by the migration (NOT introduced by it): `tokens.json` has no `shape` key though `theme.ts` exports `tokens.shape`, and `color.base` has no `text` and `aspects` uses `category` not `group` — `tsc` was already failing on these before the move. Left as-is (out of scope); close by aligning tokens.json with theme.ts.

## Leaderboard vertical shorts recap (2026-07-20)

Built out issue #13's "race through the event" vertical Leaderboard mode (`simultaneousPositionChange`, `heroRunLabel`, `showPreviousCurrentRuns`, `LeaderboardRunSequence` — see doc comments in `packages/video/src/leaderboard/`).

**OIO fleet car-naming rule:** if a car in a graphic is one of OIO's own fleet vehicles and that vehicle has a name, use the name instead of a year+make+model description (e.g. "Red Bomber Miata", not "1990 Mazda Miata") — no model year on a named fleet car. Only applies to OIO's own cars; other competitors' cars (e.g. Graham's — not an OIO car) keep the normal year+make+model treatment. First applied to the KCR SCCA RallyCross recap's rallycross fixtures (Ian and Larry both drive the fleet's "Red Bomber Miata"; Ryan's personal MGB GT is labeled "MGBGTS" per his own preference, no year).
