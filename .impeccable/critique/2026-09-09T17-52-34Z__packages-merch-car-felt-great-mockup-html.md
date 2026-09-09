---
target: packages/merch/car-felt-great/mockup.html
total_score: 14
max_score: 20
na_heuristics: 1,3,7,9,10
p0_count: 1
p1_count: 2
timestamp: 2026-09-09T17-52-34Z
slug: packages-merch-car-felt-great-mockup-html
---
Method: dual-agent (A: design review sub-agent · B: detector/browser-evidence sub-agent)

Target: `packages/merch/car-felt-great/mockup.html` (rendered to `out/tee-two-tone.png`, `out/tee-mono.png`, `out/print-*.png`). Mode: Persuade (an apparel graphic).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | n/a | static graphic, no state |
| 2 | Match System / Real World | 4 | verbatim paddock cliché; boxed attribution mirrors the channel's real lower third |
| 3 | User Control and Freedom | n/a | nothing to undo |
| 4 | Consistency and Standards | 2 | tee mockup and print file laid the attribution out differently (fixed this run); hero weight 700 vs the guide's unshipped 900 |
| 5 | Error Prevention | 2 | print width and centre were hand-picked and unasserted; text overflowed its container silently (fixed this run) |
| 6 | Recognition Rather Than Recall | 3 | joke needs recall of a cliché non-racers may not know; no maker's mark to recognise |
| 7 | Flexibility and Efficiency | n/a | no wearer interaction |
| 8 | Aesthetic and Minimalist Design | 3 | nothing superfluous; off-centre lockup and a clip-art neck opening cost a point (both fixed this run) |
| 9 | Error Recovery | n/a | no errors to recover from |
| 10 | Help and Documentation | n/a | no user-facing help applies |
| **Total** | | **14/20** | **Good (70%)** |

## Design Specificity Verdict

**LLM assessment:** Apex-conformant, not yet OIO-authored. Every brand rule is executed: one heavy wide Helvetica Bold face split by colour, widths matched to the pixel, one accent, square corners, caps, never italic, shipped font only. It is recognisably the "SLEEPER / DRAG WAGON" thumbnail lockup on cotton. But nothing on the garment says OIO: no circle, no wordmark, no sleeve or back-neck mark, and white-over-yellow Helvetica on black is a common commercial look. The one authored moment is the attribution as a corner-label box, a lower third for the one person who never gets one, and it is the smallest thing on the shirt.

**Deterministic scan:** `detect.mjs` clean on both the template and the filled copy (0 findings, exit 0). With `--no-config` the only rule that fires is `overused-font` on the five Helvetica declarations, which `.impeccable/config.json` registers as the confirmed brand exception. Every colour literal in the file is inside the SVG shirt drawing (fabric shading); all brand chrome reads token custom properties set at runtime. No border-radius, no italic, `lang` set, SVG has an accessible name.

**Visual overlays:** none. No mutable-DOM browser tool in this session, so the live overlay flow was not run; evidence came from headless Chromium `--dump-dom` measurements and screenshots.

## Overall Impression

Big, confident and correct; the irony lands when the viewer reaches the box. The single biggest opportunity was the geometry: the lockup measured 387 stage units against a 320-unit container and sat 33 units right of the shirt centreline, with the attribution aligned to the container rather than the ink. That has been fixed and is now asserted at render time.

## What's Working

- The lockup is measured, not eyeballed: both rows land at 300.1 units, centre at 500.0, and the render fails if they do not.
- The attribution as a corner-label box is the OIO-specific idea and it carries the punchline.
- Production discipline: tokens and font paths injected at render time, missing brand face fails the build, caps and never-italic enforced in CSS, a real single-ink variant.

## Priority Issues

- **[P0] Print overflowed its container, off-centre, attribution on the wrong edge.** Fixed: container is `fit-content`, punch size is solved from a 300-unit (12in) target, render asserts width and centre within 1 unit.
- **[P1] Print sat at the armpit line.** Fixed: ink top now ~3.75in below the collar rib.
- **[P1] Blank read as clip-art.** Partly fixed: neck opening now shows inside-back fabric, body tapers instead of flaring, sleeve hems curve, shadow sits under the shirt, knit multiplied over the ink. Still a drawing; compositing onto a photographed blank is the next step. Suggested command: /impeccable polish.
- **[P2] The shirt is unsigned.** Open, Ian's call: a small solid circle wordmark at back neck or sleeve per DESIGN.md §The circle, keeping the front type-only.
- **[P2] Punchline dies past arm's length and in feed-size images.** Attribution floor raised from 0.21 to 0.26 of the punch size; treat the print crop, not the tee, as the first frame of any post.
- **[P3] Em dash inside the box.** Changed to a plain hyphen, matching the Brains note and the house rule against em dashes.

## Persona Red Flags

- **Jordan (first-timer):** reads a proud slogan until within ~2m; the box can read as a size sticker in a product shot.
- **Casey (distracted mobile):** at feed size the attribution is a few pixels; the joke is absent from the full-tee image.
- **Riley (stress tester):** `?punch=80` or a longer quote now fails the render instead of overflowing silently; a light-garment variant is still impossible because the box only reads `cornerLabel.onDark`.
- **Grassroots racer:** gets it instantly, then finds nothing on the shirt saying whose it is.
- **Prospective sponsor:** nothing for them here; PRODUCT.md still records merch as undecided.

## Minor Observations

- `.tier` borrows `letter-spacing: -0.01em` from the guide's `.hero-line.wide`, which specifies weight 900; only 700 ships, so 700 is right and the guide's spec is the unbuildable one.
- `print-*.png` are previews on the garment black, not print-ready files; the transparent export is a one-flag change.
- Helvetica Neue 400 is declared and unused.
- `neutral.gray100` is the first light surface in the repo; it is a mockup ground, not a brand surface, and the README says so.

## Questions to Consider

- Why Spark? The line is the struggle beat dressed as a payoff. Is the earnest victory-yellow the joke, or should the punch be Grit?
- A lone boxed part is the case the corner-label rule says to skip. Is there a true two-part label (plain fact + boxed name) that holds for every driver?
- What is this mockup for: proving the joke (needs a photographed blank) or proving Apex survives a garment (needs neck label, sleeve mark, hang tag)?
