# @oio/social-card

Chrome-free branded OIO social-card renderer. Reads `@oio/tokens` and composites the card
(full-bleed photo + OIO badge + bottom vignette + corner label) with `@napi-rs/canvas` — no
Remotion, no headless browser, ~250ms/card. This is the default path for making a post.

It is a **verified pixel-faithful** reimplementation of the Remotion `SocialCard`
(`packages/video/src/social/SocialFrame.tsx` + `CornerLabel` + `BrandCircle`): 0.7% overall
mean diff against the Remotion reference, badge/label zones visually indistinguishable
(residual is Skia-vs-Chrome text antialiasing). If you change the brand math, re-diff against
`packages/video/scripts/render-social-still.mjs` before trusting it.

## Usage

```bash
# render (PNG or JPEG by extension)
node packages/social-card/src/cli.mjs render <props.json> <out.png|out.jpg> [--jpeg-quality 0.9]

# host a file and print a public direct URL (Upload-Post-ready; tmpfiles.org)
node packages/social-card/src/cli.mjs upload <file>
```

`props.json` (identical shape to the legacy Remotion `render-social-still.mjs`):

```json
{ "photoPath": "/abs/photo.jpg", "fact": "09 GE8 FIT", "name": "FITTY CENT",
  "anchor": "right", "surface": "light", "cropX": 50, "cropY": 50, "zoom": 1, "aspectId": "wide" }
```

- `aspectId`: `square` | `portrait` (4:5) | `wide` (1.91:1) are the Instagram-feed ratios;
  `landscape` (4:3) / `tall` (3:4) are general-crop only — never post those to IG.
- `surface`: `light` or `dark` — drives badge invert + which corner-label part gets the
  contrasting box. Pick by sampling the real photo's badge/label zones, not by guessing.

## Brand rule

Every brand value comes from `@oio/tokens`. Do not hardcode a color/type/spacing value here —
that's the same rule the video components follow. The CLI never calls Post-Bridge / Upload-Post
(those are MCP tools the agent holds); it hands back a finished file + a fetchable URL so the
agent makes exactly one upload call.
