# OIO Apex — repo rules

This repo's source of brand truth is `oio-apex-brand-guide.html` + `HANDOFF.md` (decisions and the "why" behind them). `refs/` holds real-photo references used to validate design choices — decisions here are checked against real footage, not assumed.

## Brains — where the facts live

This repo owns **form**: brand rules, tokens, component code. Brains owns **facts**: which cars exist, who owns them, what a label should say. Before building any graphic that names a vehicle or a person, look the vehicle up in Brains. Never invent a year, chassis code, owner or nickname — if it isn't in Brains, ask.

**Which server.** Ian's own brain, never `brains-staging`. Confirm with `resolve_project("oio")`: the right server returns slug `oio`, `projectPath: projects/oio`, and a page count in the hundreds. A server answering with single-digit page counts is the wrong one.

**Paths this repo actually needs**, all under `projects/oio/projects/apex/canonical/`:

| Page | Holds |
|---|---|
| `vehicles/<slug>.md` | per-vehicle corner-label `fact` + `name`. Per-post overrides are expected and sanctioned by the page itself. |
| `caption-voice.md` | social caption voice |
| `oio-apex-social-generator.md` | social-card + publish pipeline |
| `video-lower-third-pipeline.md` | the `brand-video.mjs` lower-third pipeline |

Channel-wide voice and roster sit one level up in `projects/oio/canonical/` (`oio-caption-system-prompt.md`, `oio-team-bios.md`). Pull with `pull_session_bundle(folder: …)`, never `tags` — tags are hand-maintained and silently return an incomplete slice.

**When Brains and `HANDOFF.md` disagree, split by kind.** `HANDOFF.md` wins on how a label is *built*; Brains wins on what the car *is*. A vehicle page can legitimately carry a `fact` string that predates a locked rule: `vehicles/keegan-prelude.md` carries `1982 HONDA PRELUDE`, but §Corner labels locked 2-digit year, no century, no make on 2026-07-18, so it must render `82 PRELUDE`. Reformat the fact to the rule; never change the car.

**Long label copy clips silently.** `LowerThird.tsx` is `whiteSpace: nowrap` + `overflow: hidden` with **no width guard**, so an over-long `fact` + `name` is cut off at the frame edge and nothing errors or warns. (`caption-video.mjs` measures every rendered card and fails on overflow; the lower third does not.) `1982 HONDA PRELUDE` has now caused this twice — once in the social card, once in a reel lower third. Always measure the rendered frame, never trust the render exiting 0.

## Before building any new visual/component work

1. Read `HANDOFF.md` for the locked decisions relevant to what you're building (color roles, type scale, corner-label rule, hero-text rule, etc.) before writing any code or CSS.
2. Extend the existing visual grammar instead of inventing a new one. In particular, the **corner-label rule** (`.corner-label` in the brand guide, `HANDOFF.md` §Corner labels) is the shared grammar for any new on-screen graphic: left side = fact, right side = name/sub-fact, the box always sits on the outer frame edge, and the box always contrasts with its own background (white box on a dark shot, black box on a light shot) — the unboxed side just matches the frame color.
3. Any component work under `packages/` reads brand values from `@oio/tokens` (`packages/tokens/tokens.json`), never re-derives a color/type/spacing value by eyeballing the HTML guide. This is an npm-workspaces monorepo: `packages/tokens` (brand truth: tokens + licensed fonts), `packages/video` (the Remotion project), `packages/social-card` (the Chrome-free `@napi-rs/canvas` still renderer used for posting). See `HANDOFF.md` and Brains `oio-apex-social-generator` for the why.

## After building

Run `/impeccable` (critique/polish mode) on the result before calling it done. This repo already has the skill installed project-locally (`.claude/skills/impeccable`), with `.impeccable/config.json` registering Helvetica as a confirmed brand exception to the `overused-font` rule — don't let it re-flag or swap that font.

## Verifying visual changes

Load and look at the actual rendered output — don't infer correctness from reading CSS/JSX. This guide's history has repeated real bugs that only showed up under live measurement (flex-stretch breaking width comparisons, `focus-visible` only firing on the last sibling, missing `<meta charset>` mangling em-dashes, etc.) — see `HANDOFF.md` for the full list.

**Use Playwright, not just `remotion still`, whenever Storybook is involved.** `packages/video`'s Storybook stories (the `Player`-based ones especially) can render correctly in a `remotion still`/CLI render while being genuinely broken in the browser they actually ship to — confirmed twice: a flexbox `min-width: auto` bug that silently disabled `text-overflow: ellipsis` (no CLI render would ever catch this — it's a browser-DOM-only failure mode), and a headless-Chromium `Player` autoplay block that made a story render as if frozen at frame 0 (looked like a real bug until relaunching Chromium with `--autoplay-policy=no-user-gesture-required` fixed it — don't mistake that particular symptom for an actual defect). Playwright is already available in this repo (`packages/video`'s `node_modules/.bin/playwright`, via the `@vitest/browser-playwright` dependency) — no install needed, just `npx playwright install chromium` once if the browser binary itself isn't present yet. Screenshot the actual Storybook iframe (`http://localhost:6006/iframe.html?id=<story-id>&viewMode=story`) rather than trusting a CLI render alone whenever the change touches a Storybook-only composite (device-frame previews, multi-layer stories) or anything CSS-layout-adjacent (flexbox, text truncation, overflow).
