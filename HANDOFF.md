# OIO Apex Brand Guide — handoff notes

Working files: `packages/tokens/tokens.json` (authority) and `packages/video/src/Apex.mdx` (the visual guide, rendered from those tokens in Storybook).
Status: draft, still being worked out — **not yet saved to Brains**. Don't push to Brains until told it's final.

## Guide replaced by Storybook docs — 2026-08-11

`oio-apex-brand-guide.html` and `dev-server.py` are gone. The guide is now
`packages/video/src/Apex.mdx`, the `Apex/Brand Guide` docs page in Storybook.

**Why.** The HTML guide restated brand values as hardcoded markup. `tokens.json`'s
own header recorded the problem: *"mirrored by hand into
oio-apex-brand-guide.html; that mirror has drifted before"*. The guide was also
still the *source* in that file's `$schema` line ("extracted from
oio-apex-brand-guide.html and HANDOFF.md") while `DESIGN.md` had already made the
token file authority — so the most visible statement of the system was a
downstream copy claiming to be upstream.

**What changed.** The guide keeps its own look: `ApexGuide.tsx` is the original
markup and `apex-guide.css` is the original stylesheet, scoped under
`.apex-guide` so `html, body`, `*`, bare `label` and `details.rules` cannot leak
into Storybook's chrome. What moved is where the values come from — the original
`:root` block is gone, those custom properties are set from `@oio/tokens`, and
every documented hex, rgb pair and type step is read from the token file. A
swatch, a contrast role or a corner label can no longer disagree with what
ships. Change a token, the guide changes.

The root carries `sb-unstyled`, Storybook's own opt-out (its docs CSS wraps
element rules in `:where(:not(.sb-unstyled, .sb-unstyled *))`), rather than
fighting the docs stylesheet on specificity. Without it the guide inherited
Nunito Sans everywhere the original inherited Helvetica from `body`.

**Verified against the original**, rendered side by side: 617 elements and 132
class combinations in both, identical class histograms, identical innerText at
3,710 characters, and identical computed family/size/weight/case/tracking/colour
on fourteen probes across the guide's type classes.

Two React-specific fixes the port needed: `checked` became `defaultChecked`, or
the type tabs freeze as a controlled input with no handler, and the tagline
needed an explicit `{" "}` where JSX dropped a space HTML collapsed.

Four literals survive because they are not brand values and have no token:
`#171310` (photo-mock gradient), `#c7ccd1` and `#eceef0` (light-UI mock), and
`#e9e5de` (inline emphasis).

**New library pieces**, specified in the tokens but never coded:

- `foundations/Heading.tsx` — `PageHeading` (the locked `type.heading` style,
  clamped between two named steps, positive tracking), `SectionHeading` (mono
  sequence marker in a corner-label box, per `type.heading.subheadRule`), and
  `RuleNote`. Documented in `Foundations/Headings`, including a story that
  renders one inside a deliberately hostile stylesheet.
- `foundations/ColorRamp.tsx` — `AccentSpec`, `NeutralSpec` and `ContrastTable`
  joined the existing ramps; `Swatch` and `Ramp` are now exported. The contrast
  table renders `color.contrast` directly, so the 2026-07-28 finding that Steel
  cannot carry body text is stated by measurement rather than by prose.

**Components must not rely on inheritance.** Storybook's docs CSS beat plain
cascade and rendered `BrandCircle`'s wordmark at 16px in Nunito Sans inside a
96px circle; `SectionHeading`'s `h2` picked up a stray border the same way. Both
now declare their own family, size, weight and border inline. Anything meant to
be embedded elsewhere should do the same.

**Open:** the guide keeps its own `.brand-circle` markup rather than using
`BrandCircle`. The two are behaviourally identical — same 0.36/0.533/0.689/0.644
glyph ratios, same optical-centring offsets, verified against the original CSS —
but the guide inherits `--d` from layout wrappers and positions two circles
absolutely, which the component's explicit `diameter` prop would have to
re-plumb. Note also that `invert` means opposite things in the two: the guide's
`.brand-circle` is white-on-black by default and `.invert` flips it, while the
component defaults to black-on-white. Worth reconciling.

**Storybook config.** `Apex` sorts first in the sidebar, ahead of Foundations,
and docs now render on `themes.dark` — Apex defines no light ground, so a guide
on Storybook's default white would have been showing the brand on a surface the
brand does not have.

**Not carried over.** Section 05's hero lockup is documented but not
componentised: the flush edge-to-edge rule needs per-glyph measurement and a
horizontal nudge, which nothing in the library implements yet. The section says
so rather than shipping an example that quietly breaks the rule.

## Decisions locked in so far

**Style name:** Apex. "Grit going in, spark coming out."

**Color:**
- Core (pick one by mood): Spark `#F5C200` yellow (payoff/victory), Grit `#D2301E` red (struggle/mechanical, used to be orange)
- Support: Rust `#E07020` orange (vintage/patina only, not a mood pick), Flag `#4C9F45` green (confirmation/pricing signal only, not a mood pick — per Impeccable's own semantic-color guidance)
- Full 5-step tint/shade ramps defined per color as CSS custom properties

**Type scale:** one prescriptive rem-based system, custom properties `--size-caption` through `--size-hero-xl`, named after HTML elements up to h1 then `hero-sm/md/lg/xl` beyond. ~1.25 ratio, hand-rounded.

**Fonts (type suite):**
- Helvetica — lead/body, full size range, **and display** (see Page headings below)
- Helvetica Neue Condensed Black — **corner-label numerals and leaderboard digits only** as of 2026-07-28; the display/punch role is retired. No italic ever
- SignPainter — vintage script, hero sizes only (120–160px), flat color only (no gradient/outline/drop-shadow — tried that once, rejected as "garbage")

**Page headings (locked 2026-07-28):** the heading style for a *document* — a build record, a spec sheet, a README rendered for the web. Distinct from the two-tier thumbnail hero lockup, which stays section 05's job.

- **ALL CAPS, wide Helvetica Bold**, weight 700, letter-spacing **+0.01em**, line-height **1.04**, `text-wrap: balance`.
- **Size is fluid between two named steps** — `clamp(h3, 7vw, h1)` — never a fixed step and never an ad-hoc size. A page heading has to hold from a phone to a desktop, and clamping between scale steps keeps it on the scale at both ends instead of inventing sizes in between.
- **Tracking is positive, not negative.** Tightening it pulls the heading back toward the condensed look the 2026-07-16 hero decision explicitly rejected.
- **Section headings** pair a mono sequence marker in a corner-label box (left, boxed, contrasting) with the title, so numbered sections read as part of the existing grammar rather than a new device.
- Canonical values live in `packages/tokens/tokens.json` under `type.heading`. First shipped by the recap build-record page (`packages/video/scripts/recap-artifact.*`), which reads them from the token file rather than restating them.

**Why this closes the Condensed Black open item** (previously flagged under Hero text): the hero punch had already moved to wide Helvetica Bold, leaving Condensed Black's "display/punch" role unclear. Two things settled it. The footage and thumbnails read wide, not condensed — the same evidence that drove the hero decision. And Condensed Black **is not shipped as a font file**, so declaring it renders correctly on a Mac with the face installed and silently falls back in every headless render; that exact mismatch has already shipped off-brand corner-label text once. Condensed Black keeps the numerals role it is actually used for and loses the one it was only nominally holding.

**Corner labels (`.corner-label`):** flexbox, two divs, no gap (flush). The **box always sits on the outer edge** (whichever side is anchored to the frame edge) and always contrasts with its own frame — white box on a dark shot, black box on a light shot. The plain (unboxed) side just matches the frame color. Confirmed against real footage in `~/Downloads/thumbexamples`, not assumed.

- **All-caps, always (locked 2026-07-23):** both halves of a corner label render in caps regardless of the casing a caller passes. Enforced in the renderers rather than by convention (`LowerThird.tsx`, which `EventDate`/`VenueTag` ride on; `CornerLabel.tsx`; `SocialLink.tsx`; `packages/social-card/src/card-draw.mjs`), and applied before any text measurement, since the box is sized from the measured string and caps are wider. **Why:** a mixed-case `82 Cressida / Ian` shipped on a reel before the rule was written down; leaving casing to whoever types the prop guarantees drift across hand-written props, config files and scripted renders.
- **Left = fact, sharpened 2026-07-18:** 2-digit year (no century, no make) + chassis code + model, all together when a chassis code exists and is enthusiast-recognized (`91 SW20 MR2`, `02 EK9 Civic`). No chassis code (ordinary econobox, no enthusiast code) → year + model only, no make (`91 Civic`, `98 Fit`). Year+model always paired — never drop one or the other.
- **Right = name/sub-fact, context-dependent:** race/event footage → driver name. Static/show footage → car's own name if it has one, else fall back to the owner's name if known. If neither a car name nor an owner is known, **omit the right side / skip the label entirely** rather than guessing or defaulting to make.

**Hero text (two-tier headline):** setup line + punch line. **Never italic** (checked every real thumbnail — none are italic). Reworked 2026-07-16 to match `refs/thumbexamples` (6 real thumbnails):
- **A translucent black box carries the text** (`rgba(0,0,0,0.72)`) — the signature move, present in 5 of 6 real thumbnails. Same box aesthetic as the section-04 corner labels.
- **Both tiers are ONE heavy face split by colour**, not two different fonts. The face is the **wide Helvetica Bold/Black cut** — decided over the narrow Condensed Black (the footage reads wide, not condensed). One line white, one line the mood accent.
- **Font decision — RESOLVED 2026-07-28.** Was: hero punch is now wide-bold Helvetica, so Condensed Black may be orphaned; revisit whether it keeps a role. It keeps one, narrowed: corner-label numerals and leaderboard digits. The display/punch role is retired in favour of wide Helvetica Bold. See Page headings above for the reasoning and `type.heading` in `tokens.json` for the values.
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

**Square corners (locked 2026-07-18):** every box, label, card, and pill uses hard right-angle corners — no `border-radius`, formalizing a convention that was already implicit (info pills, corner labels never had rounding) but never written down. The circle brand system (badges, rank circles, connector marks, §"The circle" above) is the one exception — always fully round, never partially rounded. Buttons default to square too, unless a future decision says otherwise. Canonical value lives in `packages/tokens/tokens.json`'s `shape` token (`shape.radius.none`/`shape.radius.circle`); documented live in section 06's rules legend and in Storybook (`Foundations/Shape`, `packages/video/src/foundations/Shape.tsx`). (The 2026-07-19 note about `tokens.json` lacking a `shape` key is stale — the block is present and carries `radius.none`/`radius.circle`; verified 2026-07-28.)

## "The car felt great" tee — first merch mockup (2026-09-09)

Brains `projects/oio/projects/merch/shirt-ideas.md` records the idea: type-only,
the universal post-session driver quote, attribution "- driver" as the punchline
kept small under the quote. Ian asked for a black-tee mockup from the style
guide. Lives in `packages/merch/car-felt-great/` (template + render script +
rendered PNGs); see `packages/merch/README.md`.

**The print is the hero lockup, not a new device.** "THE CAR" white on top,
"FELT GREAT" in Spark below, one face (wide Helvetica Neue Bold, the shipped
file), all caps, widths matched by measuring the rendered text in the page
(both lines land at the same px, verified from the DOM). Spark is the mood pick
because the line *claims* a payoff — that is the joke. The attribution is a
real two-part corner label, `DRIVER | ALWAYS` (Ian, 2026-09-10): plain
`DRIVER` in white on the left, `ALWAYS` in the white box on the right, flush
under the ink edge of FELT GREAT, 0.32em 0.55em padding, no gap. It started as
a lone boxed `- DRIVER`, which was the one case the corner-label rule says to
skip (a single boxed part with nothing beside it). Ian's steer: singular
DRIVER, because it is one anonymous driver being quoted who could be any of
them, and the box is where a lower third would put the name. Copy is passed as
`?fact=&name=` and upper-cased in the page, so variants render without edits
(`EVER`, `UNKNOWN`, `UNVERIFIED`, `ALLEGEDLY` and `PARKED` were the other
candidates). Tracking is the guide's `.hero-line`
value, -0.01em, since this is a hero lockup rather than a page heading.

**Mockup choices, none of them brand values:** the backdrop is
`neutral.gray100`, the one light neutral in the token file — a black tee has to
sit on something lighter than itself. The shirt is an SVG drawing (crew neck,
1000x1200 stage units, body 262-738 at the armpit line, read as a 19in flat
chest so 25 units/in). The print is **solved, not placed**: the punch line is
sized until its measured ink is 300 units (12in, a standard full-front platen),
the setup line is sized to the same width, and `render.mjs` re-reads the
geometry from the DOM and fails unless both rows are within 1 unit of each
other and of the target and the ink centre is within 1 unit of the shirt's.
The first pass had none of that: the two rows measured 387 units against a
320-unit container, sat 33 units right of centre, and the attribution aligned
to the container instead of the text, so the tee and the print file disagreed.
Caught by `/impeccable critique`, not by looking. Ink top sits ~3.75in below the
collar rib. The print preview renders on `base.black`, the garment colour,
because white ink on a transparent PNG is invisible in every viewer.

**Renderer:** headless Chromium via the CLI (`--screenshot`), no Playwright
module and no `npm install` — the browser Playwright downloaded is enough. A
lesson from the first render: the template's own explanatory comment contained
the `__TOKENS__` placeholder, so `String.replace` filled the comment and left
the real slot empty, and the page rendered with no tokens at all (black text on
white) while exiting 0. The script now matches the whole `<script id="tokens">`
tag. Same failure class as the lower-third clip: a render that exits 0 proves
nothing — look at the PNG.

A second one, same class (2026-09-10): Ian read the corner label as sitting low
in its box. Measured in the DOM, the caps were centred to within 0.02em of the
0.32em padding; measured in the PNG by scanning pixel columns, the box was
cut off 18px above its bottom edge. Full Chrome's `--headless=new` treats
`--window-size` as the OUTER window, so a 900px window paints an ~813px
viewport and the screenshot's lowest ~87px is never drawn. The renderer now
prefers Playwright's `chromium_headless_shell`, which has no window chrome, so
the PNG is exactly the layout. Verified by pixel scan, not by eye: the box
runs its full 136px at 83px type. The residual is the system's own: with
`line-height: 1` Helvetica's caps sit ~0.02em below the box centre, the same
as every other corner label in the repo, so it was left alone rather than
nudged on one garment.

**Locked 2026-09-10:** the two-tone (white + Spark) version, over the
single-ink white. **Open, Ian's calls:** (1) Grit was never tried for the punch
line; Spark stands. (2) Whether the garment carries an
OIO mark at all (back neck or sleeve circle per §The circle); the brief's
"type-only" was about the front. (3) The `mono` (single-ink, all white) variant
exists because Spreadshop fixes ink colour per sellable, so a two-colour print
needs a blank that carries it — which blank, and whether this goes to the store
at all, is undecided; `PRODUCT.md` still records merch as undecided. The blank
is still a drawing; the next step for a real product shot is compositing the
print onto a photographed tee. Critique snapshot: `.impeccable/critique/`.

## Tooling

- Impeccable skill is installed project-locally (`.claude/skills/impeccable`). Helvetica is registered as a confirmed exception to its `overused-font` rule (`.impeccable/config.json`) — don't let it re-flag or swap the font.
- Verify visual changes by actually loading the file, not by reading the CSS and assuming — several real bugs this session only showed up under live measurement (flex-stretch breaking width comparisons, focus-visible selectors only working on the last of several siblings, missing `<meta charset>` making em-dashes render as `â€"` over HTTP, etc.).
- **Viewing the guide:** `npm --workspace @oio/video run storybook` and open `Apex/Brand Guide`. Vite HMR reloads it on save. The old single-file guide and its `dev-server.py` were removed 2026-08-11 — see "Guide replaced by Storybook docs" below.

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

## Parts/price list receipt (2026-07-26 → 07-27)

Issue #35. A build-cost tracker that reveals parts a few at a time across a video and tots up to a total, with an optional budget. Lives in `packages/video/src/parts-list/`; two compositions in `Root.tsx` (`PartsList` 1920×1080, `PartsListVertical` 1080×1920).

**It is a receipt, not a leaderboard.** The brief started as "base it on the leaderboard" and four style explorations were run against that; Ian's call was the engineer's-grid direction reskinned as a **paper receipt** — white sheet, mono grid, rules between line items. Deliberately *not* the corner-label grammar: a corner label is a caption bolted to the frame edge, this is a physical object sitting in the shot, so the §Corner labels contrast rule doesn't apply to it. Square corners still do (§Square corners).

**Flag green's first real claim.** §Color reserves Flag `#4C9F45` for "confirmation/pricing signal only, not a mood pick." This is the first component to actually use it that way: the hero total is Flag green under budget, Grit red over. The progress bar reads the same pair. If that reservation is ever revisited, this is the thing that breaks.

**Hero total is SignPainter, flat colour** — consistent with §Fonts, *not* the layered `.vin-stack` reversal (no gradient, outline or shadow on it). Two extensions of the recorded rule, both deliberate:
- **The `$` never takes the budget colour**, whatever the figure does — the mark reads as punctuation, the number carries the signal. It was black through 2026-07-26; Ian moved it to the sheet's secondary ink (`neutral.muted2`, the vendor/column-head tone) on 07-27 because black was "a bit too in your face" at the size the figure runs.
- **Size is derived from the cell, not the 120–160px band** §Fonts records for SignPainter. Ink target is `cellH × 1.5` = 180px landscape / 198px portrait, so the em size lands above that band, and the figure intentionally overflows the total box on all four sides. Sized from the real **ink box** (`actualBoundingBox`), not the line box — same optical-centring method §The circle uses for the brand glyphs, and for the same reason: a script face's ascenders/descenders sit the visible number low if you centre the text box. The `$` is included in the measurement because it is the tallest and deepest glyph in a price.

**Figure kerning, measured not eyeballed:** tracking `-0.025em`. Named in `fitFigure.ts`; re-measure rather than nudge.

**Whole dollars, no cents anywhere (Ian 2026-07-27).** The ledger is a rough estimate of what a build cost, and cents spent a lot of the largest element on screen implying precision it doesn't have. Rounding is applied to **line prices**, not just to what gets printed: round the lines and the total separately and the eleven Nessie rows visibly sum to $352 while the total reads $353 — on a receipt, of all things. `sumTo` therefore sums rounded prices, so the total is always exactly what the visible rows add up to; the raw ledger values are untouched in the config. The headline total is **$352**, one dollar under the $352.66 recorded above. This retired the cents group and its own measured kerning (cents at `0.55×`, pulled back `0.10em` — `0.18em` had measured a **−3.5px** ink gap, the decimal sliding under the preceding digit as a smudge, and `0.10em` measured **+6.1px**). Deleted rather than left dormant; recorded here in case cents ever come back.

**Parts land ONE AT A TIME, never as a batch (Ian 2026-07-27).** He speaks over the clip, so each line needs room to be talked about before the next shows up. `partBeatSeconds` (default 2.4) is the arrival-to-arrival gap and is the knob that sets a clip's length — an appearance adding `n` parts runs roughly `n × beat` plus the open and close beats, so appearance 1 went from ~4s to 14.7s. The total steps once per arrival rather than sweeping across the batch, and **the window follows the arrivals down** (`windowStops`) instead of jumping once to a final position — which is what lets a segment LONGER than the window play at all: one 11-part batch against a 5-row window scrolls a row at a time and lands all eleven on screen. Choreography moved to `parts-list/choreography.ts`, deliberately free of React and font side effects so every frame can be simulated in plain Node; sampling frames hides ordering bugs, so it is verified by walking *every* frame of every appearance.

**A row can be pinned to a second in the clip.** `PartLine.at` is the second that line lands; without it the part falls back to the uniform beat, and the two mix freely so a list can be dialed in one line at a time. Ian 2026-07-27 asked for exactly this — "have a second mark in a video that it needs to be added into, that way you can always adjust that data and have it generate what you need." It lives **on the item, not in a parallel array of times**: a separate array has to be counted into position, and one mis-counted entry silently syncs the wrong part; on the item, the part and its mark are read and edited together. `durationSeconds` pins the clip's length to the footage's so the render overlays 1:1, and `calculateMetadata` now takes width/height from the config for the same reason.

Marks belong to one *telling* of a ledger, not to the parts, so a narrated cut is its **own dataset file** — `nessie-exhaust-readthrough.json`, the Nessie list cut to Ian's 2026-07-26 read-through (143.6s, 1620×1080, one appearance holding all eleven parts). Each mark is the second he first **names** the part, not when he says its price, so the row is up while he talks about it; they came from a word-level transcript of that audio and are only valid against it. To nudge a row, edit its `at` and re-render. He notes on the clip that a couple of the parts turned out not to be needed — **marking a row superseded is a future feature**, deliberately not built here.

**`side: "left" | "right"`** puts the sheet on whichever edge the footage leaves empty (default left; the read-through is right, because he sits camera-left). `"right"` mirrors the sheet's own left margin to the far edge rather than introducing a second number to keep in sync.

**Type floor: nothing on the sheet may sit under `PHONE_FLOOR`** — 28px landscape, 34px portrait (`layout.ts`). Ian 2026-07-27: "make the smallest size font readable on a phone." Anchored to the short-form leaderboard, which landed on 34–36px against a 1080x1920 master and **deleted** its ~24px car/model subtitle as unreadable at that scale, not to a guess. The two numbers differ because a composition pixel is not the same angular size on glass: a 1080x1920 master plays full-bleed (~0.36 pt/px on a handset), a 1920x1080 master watched fullscreen-landscape gets ~0.44. A landscape cut dropped into a *vertical* feed is ~0.20 and nothing at this scale survives it — cut portrait for those. Everything grew to clear the floor (landscape rows 58→78px, portrait 68→94px), so landscape now shows **5 rows instead of 7**.

**The `01/02/03` index column is gone** (Ian 2026-07-27) and its width went to the type.

**Emphasis is no longer an enlargement.** An arriving line used to scale 1.35×. At the phone-readable scale the longest real row leaves **12px** before the amount in portrait, so *any* enlargement drives the part name through the price — measured, not predicted. It is now a width-free entrance: opacity plus a drop into place, nothing that can change a row's width. The one-at-a-time cadence is what marks the new line. `emphasisSeconds` kept its name but now only pads the clip's tail after the last part lands. Portrait's `nameSize` is also below its floor headroom (38, against a 34 vendor) for the same width reason, and the vendor — the one truncatable thing in a row — ellipsizes so a long supplier from a future ledger can never push the amount off the paper.

**Layout rules Ian locked:**
- **Portrait caps at 5 visible rows and scrolls** past that, at fixed type — it never compresses to fit. Below what the frame could hold, on purpose: a vertical cut needs the lower half free for other content.
- **Landscape anchors to the top of the frame** (`top: 0`), not the leaderboard's side position.
- **Paper is straight across the top, torn along the bottom** (`clip-path` polygon), with a generated crumple texture (`feTurbulence` + `feDiffuseLighting`). Shadow is `drop-shadow`, not `box-shadow`, so it follows the clipped alpha instead of boxing the tear.
- Total box carries a **light-gray** border, not black — the green/red figure pops off it. No footer, no masthead: the sheet starts at the column heads.

**Data and presentation are separate** (`registry.ts`): datasets are the parts, presets are the orientation/styling, `mergeConfig` combines them. Mirrors `leaderboard/registry.ts`. Config is **flat at the top level, never nested**, because Remotion's `--props` shallow-merges — a nested object silently replaces rather than merges.

**The Playground previews both cuts plus the finished sheet** (Ian 2026-07-27): landscape and portrait side by side, and the whole receipt as a standalone object — every line, final total, nothing windowed (`fullSheetLayout`, drawn through the same `Receipt` component the video uses, so it cannot drift). `orientation` still selects which composition the export panel targets; the previews ignore it. Each cut is built from **its own saved preset**, not from the selected preset with `orientation` swapped — a preset carries explicit `frameWidth`/`frameHeight`, so swapping only the orientation drew the portrait cut into a 1920×1080 frame.

**Real fixture — Cressida exhaust.** `parts-list-configs/datasets/nessie-exhaust.json`, 11 parts, $800 budget (what an exhaust shop quoted). Two legitimate totals exist and the distinction matters: **$352.66 is cash out of pocket** and is what ships; **$490.66** includes a muffler already owned. Recorded in the config so the number isn't silently re-derived.

### Font pipeline (the part with teeth)

**Every brand face is now declared in `tokens.json` → `type.fontFiles.faces`** with `required`/`usedBy`/`source`/`missingEffect`, and `npm --workspace @oio/video run sync-fonts` copies them into `public/fonts/`. A missing **required** face fails the build; optional ones warn. `packages/tokens/fonts/README.md` is the extraction guide.

**Measured fact worth not rediscovering:** in this repo's headless Chromium, **none** of `Helvetica Neue`, `SF Mono`, `Menlo`, `Consolas`, `SignPainter`, `Brush Script MT`, `Apple Chancery` resolve — only the CSS generics do. Remotion renders in a separately-downloaded Chrome Headless Shell that cannot see macOS system fonts, so anything that is only a CSS stack entry looks right in Storybook on a Mac and silently falls back in real output. Anything you want on screen has to be a file.

**Font availability is a build-time fact, never a runtime probe.** `sync-fonts` writes `src/foundations/available-fonts.json`; the loader only ever starts a load it knows will resolve. **Why this is a rule and not a preference:** probing at runtime killed a real render with `delayRender was called but not cleared after 8000ms`. The obvious fix — racing `FontFace.load()` against a `setTimeout` — **fails identically**, because Remotion controls timers during a render, so a wall-clock timeout never fires. An optional font must not be able to hang a render.

**`npm run fonts:extract`** (repo root, macOS only) pulls SignPainter out of the system `.ttc`. Selects by PostScript name, not collection index — order isn't stable across macOS versions and index 0 silently yields the wrong face. This is the one step in the pipeline that can't run anywhere but a Mac; everything downstream is machine-independent.

**Open item — the mono face.** The receipt body is entirely mono, and the `mono` token's stack is all system faces (`SF Mono, Menlo, Consolas, monospace`). It renders, but in *whatever mono the host has* — Menlo on a Mac, DejaVu Sans Mono headless. Not broken, but it's the same preview-vs-output drift the Helvetica embedding exists to prevent, and the receipt is the most exposed component. Options and trade-offs are written up in `packages/tokens/fonts/README.md`; **left for Ian — it's a brand decision, not a mechanical extraction.**
