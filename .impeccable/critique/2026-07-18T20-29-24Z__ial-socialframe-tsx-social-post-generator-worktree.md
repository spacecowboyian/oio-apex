---
target: social-post-card headless pipeline (badge halving + Helvetica Neue embedding)
p0_count: 2
p1_count: 1
timestamp: 2026-07-18T20-29-24Z
slug: ial-socialframe-tsx-social-post-generator-worktree
---
Method: dual-agent (A: af3a92ab5c2c0d9d3 · B: ac832047dc382659b)

## Design Health Score (adapted — most Nielsen heuristics don't map to a generated static-image pipeline with no interactive UI; scored only where meaningful, rest marked N/A per Assessment A)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | N/A | Headless batch render, no UI feedback loop |
| 2 | Match System / Real World | 1/4 | Card looks right as a flat PNG but fails how IG actually displays it — profile-grid crop removes both brand elements |
| 3 | User Control and Freedom | N/A | No interaction to control |
| 4 | Consistency and Standards | 1/4 | Brand guide (declared source of truth) documents a badge size and aspect ratio the pipeline no longer produces |
| 5 | Error Prevention | N/A | No user-facing error states |
| 6 | Recognition Rather Than Recall | N/A | No interactive UI |
| 7 | Flexibility and Efficiency | N/A | No interaction to accelerate |
| 8 | Aesthetic and Minimalist Design | 3/4 | Clean, restrained; badge contrast strategy under-designed for sky-heavy crops |
| 9 | Error Recovery | N/A | No user-facing errors |
| 10 | Help and Documentation | N/A | Not applicable to this asset type |
| **Total** | | **5/8 scored** | Scored heuristics are weak (brand-guide drift, IG grid-crop failure); unscored ones genuinely don't apply |

## Anti-Patterns Verdict

**LLM assessment (Assessment A)**: Reads as a deliberate, specific brand asset, not a generic template — the corner-label rule, tuned vignette, and real Helvetica Neue embedding are all load-bearing brand work. Not AI slop. The real problem is a **process failure**: `tokens.json` was fixed today (badge halved, aspect ratio corrected from 3:4→4:5) but `oio-apex-brand-guide.html` — this repo's declared "source of brand truth" — and `HANDOFF.md` were not updated to match, so the guide currently documents a configuration that's already been proven to break real posts.

**Deterministic scan (Assessment B)**: `detect.mjs` returned zero findings (exit 0) across SocialFrame.tsx, SocialCard.tsx, CornerLabel.tsx, BrandCircle.tsx. Expected and honest — that detector's 40 rules target marketing-page markup (gradient text, eyebrow chips, card grids); this is an image-compositing layer with no page chrome for those rules to catch or miss. Not a signal of quality either way.

**Token math (Assessment B)**: All current tokens.json values check out as SAFE in isolation — badge diameter is 8.9-11.9% of the shorter export dimension depending on aspect (a sane watermark scale), corner-label text is ~15px effective size even at Instagram's in-feed display width (well above the ~8-10px legibility floor), and both export aspect ratios (4:3 landscape, 4:5 portrait) are within Meta's accepted feed range. The math is internally consistent; the problem Assessment A found is about a real-world display context (profile grid) the math didn't account for.

## Overall Impression

The brand system itself is well-designed and the two fixes made this session (badge halving, Helvetica Neue embedding) are both real, verified improvements — not cosmetic. But the session's own changes exposed that this repo currently has **three disagreeing sources of brand truth** (tokens.json, the brand guide HTML, HANDOFF.md), and a genuine unaddressed risk: both brand-identifying elements (OIO badge, vehicle corner label) are placed close enough to the frame edge that Instagram's profile-grid square-crop removes them entirely, on both aspect ratios. That's the single biggest opportunity — not a taste problem, a survivability problem for the brand mark itself.

## What's Working

- **Corner-label execution**: consistent box discipline, correct fact/name split, zero truncation on real long captions ("1972 DATSUN 521"), crisp at pixel-level zoom.
- **Helvetica Neue embedding fix**: genuinely solved a real problem (headless Chrome font substitution) — confirmed via letterform inspection, no visible metric-substitution artifacts.
- **Vignette tuning**: matches the brand guide's own CSS stop-for-stop, and reliably manufactures legible contrast regardless of what's actually in the photo underneath the corner label.

## Priority Issues

**[P0] Badge and corner label vanish in Instagram's profile-grid crop, on both aspect ratios.**
Why it matters: IG's profile grid (and hashtag/explore grids) center-crops any non-square post to a square automatically. Simulated directly: landscape loses the badge entirely and truncates the corner label to "TO"; portrait loses the corner label entirely and reduces the badge to a sliver. This is the most common way people browse an account's back-catalog — on that surface, an OIO post is currently indistinguishable from any other car photo.
Fix: pull badge/corner-label offsets in from the current 2.22cqw (~24px, ~2-3% of frame) to something that survives a 12.5%-per-edge grid crop — roughly 100px+ margin at 1080px width — or explicitly accept and document the grid-crop tradeoff instead of leaving it undiscovered.
Suggested command: `/impeccable layout`

**[P0] Brand guide §06 still documents the 3:4 vertical ratio that was replaced today specifically because it broke a real post.**
Why it matters: `oio-apex-brand-guide.html` (lines ~1107, ~1746-1747) still shows "Vertical — 3:4" and `aspect-ratio: 3/4`, while `aspects.ts` was changed today to 4:5 with a code comment describing the exact real-world breakage that motivated the fix. The guide is this repo's declared source of brand truth (per CLAUDE.md) — anyone consulting it today designs against the wrong, already-disproven ratio.
Fix: update the guide's `.zone-diagram.ar-34` rule and caption to 4:5 / `aspect-ratio: 4/5`.
Suggested command: `/impeccable harden`

**[P1] Brand guide §06 and HANDOFF.md still show the badge at 17.8cqh — double the pipeline's current 8.9cqw.**
Why it matters: tokens.json's own changelog says it's now authoritative after the halving, but two of the three brand-truth sources disagree with it as of today's change.
Fix: update guide's `.z-logo { --d: ... }` to match, add a HANDOFF.md line noting the second halving.
Suggested command: `/impeccable harden`

**[P2] Badge contrast is protected by nothing when the top-left region is bright sky; only the corner label has a vignette guaranteeing contrast.**
Why it matters: both test photos have light sky at top-left, and the white badge's edge already reads low-contrast there — a brighter/overexposed sky would make it nearly disappear.
Fix: either a subtle top-scrim mirroring the bottom vignette, or let badge contrast be set independently of corner-label contrast (currently one `surface` flag drives both).
Suggested command: `/impeccable layout`

**[P3] Badge reads small (~41px) at real in-feed display width, after two size changes in one day (96px → 192px → 96px).**
Why it matters: defensible (roughly profile-picture-icon scale) but worth one real-device sanity check before treating 8.9cqw as final, since the previous "too small" call was also made without live-device verification.
Suggested command: `/impeccable critique` (re-run after a real post, if one ships)

## Minor Observations

- Badge and corner-label offsets are pixel-identical (24-25px) in both renders, confirming the token math is internally consistent — the value itself is just too tight for grid-crop survival (see P0).
- `cornerLabelMaxPartWidth` (36cqw / 389px) correctly avoids ellipsis-truncation on the longest real caption tested.
- No visible font-substitution artifacts at 3x zoom in either render — the Helvetica Neue embedding fix is confirmed working, not just theoretically wired up.

## Questions to Consider

- Is the Instagram profile-grid crop actually a case OIO needs to defend against, or is the feed view (where both brand elements are currently fully legible) the only view that matters for this account's goals?
- Now that tokens.json is confirmed authoritative, should the brand guide pull its section 06 numbers live from tokens.json instead of hardcoding them a second time — removing the drift risk structurally instead of relying on remembering to update three places?
