# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three confirmed audiences, all outward-facing. OIO's own crew is explicitly
**not** the audience — this is not a private record.

- **The grassroots racing scene.** KC region SCCA people and rallycross /
  autocross regulars. They already know what a cone penalty is and will notice
  wrong terminology or wrong numbers immediately.
- **Enthusiasts who don't race yet.** Car people encountering this in a feed who
  might be drawn into the sport. They have not run a course and do not know the
  rules. Content has to explain itself to them without slowing down for the
  first group.
- **Prospective sponsors and partners.** Shops, parts brands and local
  businesses assessing whether OIO is worth backing.

They meet the work in a social feed, usually on a phone, mid-scroll.

## Product Purpose

OIO Racing competes in grassroots motorsport and turns each event into published
content. This repo is the production system for that content: brand tokens, a
Remotion video component suite (leaderboards, lower thirds, burned-in captions),
a Chrome-free still renderer, and skills that drive them end to end.

Success is **a media property built on racing.** Audience growth is a real goal,
and output quality and cadence matter as much as race results. The tooling
exists so that publishing well is fast enough to happen every event rather than
when someone finds a spare evening.

## Positioning

The racing is real and the numbers are real. Results come off official timing
sheets and are reconciled per run before anything is rendered, drivers are named
individuals, and margins are reported as they happened including the ones that
are unflattering. A neighbouring account can copy the look; it cannot copy
actually being in the paddock with a car in the class.

## Operating Context

- **Events:** SCCA rallycross and autocross, mainly Kansas City region, plus
  one-off grassroots events (Beater Bash). Multiple runs per driver per event,
  scored on cumulative time with cone and DNF penalties.
- **Capture:** phone video, in-car camera bodies, and a photographer for stills.
  Footage arrives as many gigabytes off cards, not as a cloud drop.
- **Production:** the machine does the work. Renders are minutes long, so stages
  are scheduled so a human is never the one waiting.
- **Publishing:** Instagram, Facebook and YouTube via Post-Bridge, usually the
  same day or the next morning.

## Capabilities and Constraints

- **Times are credited.** Published run times already include penalties, so a
  gap on a board is not a pace difference. Any copy comparing drivers must be
  clear which it means.
- **Scoring:** a cone is +2s; a DNF scores as slowest in class for that run
  plus 10s (SCCA rallycross).
- **Terminology:** it is a **course**, never a track. The sport draws no such
  distinction and the wrong word reads as a mistake to the first audience.
- **Vertical is the default** for social video.
- **Renders are headless.** Anything depending on a locally installed font,
  system face or Mac-only capability will silently differ from what ships.
- **Undecided:** whether OIO ever sells anything (merch, parts, services). Not
  currently a product goal; do not build toward it or imply it.

## Brand Commitments

- **Name:** OIO Racing / Outside Inside Outside Racing. Style name **Apex**.
- **Real people, real results.** Drivers are named individuals and times are
  official data. Nothing invented, and nothing flattering that is not true.
  This is a hard constraint, confirmed.
- **Named partners get credited correctly.** Euro Speed Werks, Hot Hatch Racing,
  NAPA Auto Parts, TARA, Matlock Photography and similar. Also a hard
  constraint: this audience includes prospective partners, and a miscredit is
  visible to exactly the people it should not be.
- **No em dashes** in social copy. House rule.
- Visual system is documented separately in `DESIGN.md` and
  `packages/tokens/tokens.json`.

## Evidence on Hand

- **Official results** from Pronto Timing System pages, parsed rather than
  summarized (`packages/video/scripts/parse-results.mjs`).
- **Event footage** from phones and in-car bodies, per event.
- **Published posts** across IG, FB and YouTube, with per-post analytics
  available through Post-Bridge.
- **Car roster** with locked corner-label copy, in Brains.
- **Absent, and not to be fabricated:** audience numbers, sponsorship figures,
  testimonials, revenue, and any claim about reach. None of these have been
  established.

## Product Principles

1. **The numbers are the product.** Everything downstream derives from official
   results, so correctness at the source outranks everything else. Parse and
   reconcile; never summarize or retype.
2. **Explain the sport without slowing down for it.** Two audiences share the
   same frame: one knows the rules, one does not. A cone penalty gets explained
   in the same sentence that uses it, not in a footnote or not at all.
3. **Honest beats flattering.** Report the bad run, the reversed lap, the
   fourth place. Credibility with the paddock and with sponsors is the same
   asset.
4. **Cadence is a feature.** A media property that publishes every event beats
   one that publishes beautifully twice a season. Tooling decisions should be
   judged on whether they make the next event faster.
5. **Credit is not decoration.** Partners and photographers are named correctly
   every time, because part of the audience is deciding whether to become one.

## Accessibility & Inclusion

- The feed is watched **muted**, so anything essential must read sound-off.
  Burned-in captions exist for this.
- Published surfaces target **WCAG AA**. Contrast roles are measured and
  recorded in `packages/tokens/tokens.json` under `color.contrast`; see the
  audit findings in `DESIGN.md`.
