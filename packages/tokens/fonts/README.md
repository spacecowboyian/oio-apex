# Brand font files

The real faces, kept here as the canonical copy so every renderer registers
byte-identical fonts. `packages/video` copies them into `public/fonts/` with
`npm run sync-fonts`; `packages/social-card` reads them straight off these
paths via `fontPath()`.

**The manifest is `tokens.json` → `type.fontFiles.faces`, not this file.** Add a
face there first; the loader, the sync script and the status report all read
from it.

## Why files and not just a CSS stack

Remotion renders in a separately-downloaded **Chrome Headless Shell**, which
cannot see macOS system fonts. A face that exists only as a stack entry
(`font-family: "SignPainter", cursive`) resolves on a Mac in Storybook and
falls back to a generic in the actual render — silently, with no error. That
mismatch already shipped off-brand corner-label text once; see the note at the
top of `packages/video/src/foundations/fonts.ts`.

Measured in this repo's headless Chromium, **none** of these resolve:
`Helvetica Neue`, `SF Mono`, `Menlo`, `Consolas`, `SignPainter`,
`Brush Script MT`, `Apple Chancery`. Only the CSS generics (`serif`,
`monospace`, `sans-serif`) do. Anything you want on screen has to be a file.

Check what is present at any time:

```bash
cd packages/video && npm run sync-fonts -- --check
```

## Present

| Face | File | Notes |
|---|---|---|
| Helvetica Neue 400 | `HelveticaNeue-Regular.ttf` | Extracted from the licensed desktop `Helvetica Neue.ttc` via fontTools. Ian confirmed OIO's license covers this embedding, 2026-07-18. |
| Helvetica Neue 700 | `HelveticaNeue-Bold.ttf` | As above. |

## Missing — extract from a licensed machine

### SignPainter (`SignPainter.ttf`)

The brand's vintage script. Used by the parts-list hero total (issue #35) and
the brand guide's `.vin-stack` lockup. **Without it the hero total renders as a
generic serif in every headless render.**

It ships with macOS as a `.ttc` collection, so it needs extracting to a single
face:

```bash
python3 -m pip install --user fonttools          # once
python3 - <<'PY'
from fontTools.ttLib import TTCollection
c = TTCollection("/System/Library/Fonts/Supplemental/SignPainter.ttc")
for f in c.fonts:
    print([n.toUnicode() for n in f["name"].names if n.nameID == 4][:1])
# pick the index you want (HouseScript is normally 0), then:
c.fonts[0].save("packages/tokens/fonts/SignPainter.ttf")
PY
cd packages/video && npm run sync-fonts
```

**Licensing:** this is an Apple-supplied face. Embedding it in a rendered video
is not the same as redistributing the file, and committing the binary to this
repo is redistribution. Confirm that is acceptable — the same way the Helvetica
embedding was explicitly cleared — before committing it. If it is not, keep the
file local and untracked: the loader degrades to a fallback and says so rather
than failing.

### A real mono (`OIOMono-Regular.ttf`)

The `mono` token's stack is `SF Mono, Menlo, Consolas, monospace` — all system
faces. The stack terminates in the `monospace` generic, so text still renders,
but it renders in **whatever mono the host has**: Menlo on your Mac, DejaVu
Sans Mono in a headless render. Legible either way, and not currently broken,
but preview and output are not identical, which is the same class of problem
the Helvetica embedding exists to prevent.

The parts-list receipt is entirely mono, so it is the most exposed. Options, in
order of preference:

1. Extract `SF Mono` from `/System/Applications/Utilities/Terminal.app` (Apple
   licenses it for embedding narrowly — check before committing), or
2. Adopt a freely-licensed mono with a similar figure width and record the
   swap as a brand decision in `HANDOFF.md`, or
3. Leave it. Note in the component that the body face is host-dependent.

This one is a real brand decision, not a mechanical extraction — it is filed
here rather than guessed at.
