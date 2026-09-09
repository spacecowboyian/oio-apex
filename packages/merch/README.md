# @oio/merch — apparel mockups

Shirt ideas live in Brains (`projects/oio/projects/merch/shirt-ideas.md`); the
Spreadshop store and its rules live next to it (`spreadshop-custom-store.md`).
This package turns an idea into a mockup that obeys the Apex brand rules, so a
design can be judged on a garment before anyone uploads anything.

Each design is a folder:

```
car-felt-great/
  mockup.html   template: SVG black tee + the print as HTML, tokens/fonts as slots
  render.mjs    fills the slots from packages/tokens and screenshots with Chromium
  out/          rendered PNGs (committed, so the mockup is reviewable without a render)

The render measures what it drew: both rows of the lockup must land within 1
unit of each other and of the 300-unit (12in) target, centred on the shirt, or
`render.mjs` exits non-zero. A print that overflows never gets a green exit.
```

```
npm --workspace @oio/merch run render:car-felt-great
# or, with a specific browser:
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node packages/merch/car-felt-great/render.mjs
```

## Rules that apply to a shirt

- **The print is built from the brand's existing grammar**, not a new device.
  A type-only quote is the two-tier hero lockup (HANDOFF §Hero text): one heavy
  face, wide Helvetica Neue Bold, all caps, never italic, setup line white and
  punch line in the one mood accent, both lines sized so their rendered widths
  match (measured in the page, not eyeballed). An attribution or sub-line is a
  corner-label box (HANDOFF §Corner labels): white box on the black garment,
  0.32em 0.55em padding, square corners.
- **Every value is read from `packages/tokens/tokens.json` at render time.**
  The template carries no brand hex; `render.mjs` injects the token file. The
  only literals in `mockup.html` are the SVG's fabric shading, which is a
  drawing of a shirt, not brand chrome.
- **The backdrop is `neutral.gray100`**, the one light neutral the token file
  has. Apex has no light ground for UI, but a product photo of a black tee has
  to sit on something lighter than the tee.
- **The print is previewed on the garment colour** (`base.black`), not on
  transparent, because white ink on a transparent PNG is invisible in every
  viewer. A transparent print-ready file is a one-flag change in `render.mjs`
  (`bg: "00000000"`).
- **Ink colour is fixed per Spreadshop sellable** (see the store page in
  Brains), so a two-colour print needs a blank that prints it. The `mono`
  variant is the single-ink fallback: same lockup, all white.
- Fonts come from `packages/tokens/fonts/`. A face that is not shipped there
  does not exist for this renderer either.
