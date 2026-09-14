# @oio/360-framer

Aim and render locked flat views out of Insta360 dual-fisheye footage, without
Insta360 Studio.

A forward or rearward view lives entirely inside one lens's coverage, so no
stitching is needed — just the right projection maths.

Where the lenses live differs by body, and the tool works it out from the file
rather than assuming: the **X4** holds both as two video streams in the `_00_`
file, while the **X1** writes one stream per file, `_00_` and `_10_` side by
side, so its second lens is a second `-i`. `lensSources` resolves this once and
everything downstream takes the labels it hands back. That makes the whole path scriptable, which Studio is
not (its View Angle Gear is canvas-drawn with no accessibility hooks, and its
menu commands act on whatever document it internally considers active rather
than the clip you selected).

```
360-framer aim    --input clip.insv          # drag to aim, Save writes aim.json
360-framer render --config aim.json --input-dir x4/hudson --preview
```

## The numbers that matter

These read on screen as "everyone looks stretched" or "everything is zoomed in",
which sends you chasing the output projection instead of the cause.

**The fields live in `cameras.json`, per body, and they are not all equal.**
X1: **190 / 190**, measured. X4: **194 / 181** — where 194 is near the physical
field (~196.5 against an Insta360 Studio export) and 181 is a deliberate
vertical squeeze, kept because it is what stops the in-cabin shots reading
domed. A third body needs an entry, not a patch.

Two claims this file used to make were wrong, and both cost real time:

- **`iv_fov` 175 is impossible.** Two lenses meet only if each reaches past 90
  degrees off its own axis, so anything at or below 180 leaves a band of sphere
  neither lens saw. It renders as a black wedge that reads exactly like a
  stitching failure, and it was blamed on the blend, then on the projection,
  before the calibration itself was suspected. `checkLens` now refuses it.
- **The image circle is not an ellipse.** It measures round on real frames to
  within 0.1% (sigma x/y = 1.0004). Unequal fields change what angle a pixel
  *looks at*; they do not change the shape of the lit area. Building the seam
  mask from the fields — as though the circle followed them — tore a hole in the
  seam the moment the two differed. See **Aiming across clips**.

`360-framer calibrate` gives a starting point for a body with no known values.
It renders the forward lens rectilinear (which maps straight lines to straight
lines *only* if the input model is right), sweeps `ih_fov`, and reports where a
distant treeline stops curving. It reported ~202 for this X4, against ~196.5
from matching a Studio export of the same moment — a quadratic fitted to a
ragged treeline is a weaker signal than a known-good reference, so treat its
answer as a place to start rather than the verdict.

```
360-framer calibrate --input clip.insv
  ih_fov 198   bow -11.47 px
  ih_fov 202   bow  -0.19 px   <- straightest
  ih_fov 206   bow  +8.12 px
```

Use the quadratic sagitta, not max deviation or RMS — treelines are ragged, so
those are dominated by scene noise while the quadratic term isolates the lens.

**`v_fov` does not scale linearly with `h_fov`.** `v = h * 9/16` is wrong and
silently anamorphic: it squeezes roughly 8% of vertical out of the frame. Solve
it through the projection's own radius function instead. `lens.mjs` does this,
and `render` recomputes `v_fov` from the real output size rather than trusting
whatever is in the config.

| h_fov | correct v_fov (16:9, stereographic) | the wrong linear value |
|------:|------:|------:|
| 95 | 55.6 | 53.4 |
| 122.8 | 73.9 | 69.1 |
| 133.7 | 81.5 | 75.2 |

## The fisheye control is the output projection

Not `ih_fov`. This is worth stating plainly because the intuitive move — wind
the input field down until the picture flattens — is wrong twice over: those
numbers describe the glass, not the look, and the renderer now **rejects**
anything at or under 180, so the preview would flatten and the file would come
back at the real calibration. Measured, that trap scored 0.635 preview-to-render.
The aimer's calibration sliders now stop at 181 so the preview cannot promise
what the render will not do.

The **Output projection** control is the real lever:

| | keeps | costs | good for |
|---|---|---|---|
| `sg` stereographic *(default)* | faces and helmets round | very long straight lines bow gently | anything wide, 120 degrees and up |
| `flat` rectilinear | straight lines straight | stretches hard into the corners | narrower framings where a bent horizon reads as wrong |

Both are wired end to end — preview shader, `aim.json`/`clips.json`, the
copyable command, and `render` — and verified preview-against-render across all
six real shots in each: **0.992 mean in `sg`, 0.992 in `flat`**. Field of view
is the other lever: the same shot at a narrower `h_fov` always looks flatter,
in either projection.

`pannini` is deliberately **not** offered. v360 has one, but `R`/`R_INV` in
`lens.mjs` currently define it as a copy of `sg`, so the preview would draw one
thing and the render another. Measure it before exposing it.

## aim.json

Written by the aimer, read by the renderer, and copied next to every render so a
file can always be traced back to the aim that produced it.

```json
{
  "schema": "oio-reframe/1",
  "lens":   { "model": "equisolid", "ih_fov": 187, "iv_fov": 175 },
  "output": { "projection": "sg", "width": 3840, "height": 2160 },
  "shots": [
    { "name": "backward", "source": "lens1", "yaw": 0, "pitch": -41, "roll": 180, "h_fov": 122.8, "v_fov": 73.9 }
  ]
}
```

`source` is `lens0` (front), `lens1` (rear), or `dual`. The aimer works it out
from the framing and marks it in the UI, and `render` **recomputes it** rather
than trusting what is stored — the same rule as `v_fov`. A source that
disagrees with its angles (hand-edited config, or a calibration changed after
the aim was saved) aims out the back of that lens and renders a silent black
frame; the disagreement is now printed and corrected instead.

Aim angles are expressed in the rear lens's frame, so a `lens0` shot is
rendered with 180 degrees added to its yaw. Both rotations are about the same
axis, so they compose into yaw alone.

## Keeping the preview honest

The aimer is only useful if what it shows is what the file will contain. That
took three separate fixes, and the way they were *found* matters more than the
fixes themselves.

**Measure rendered pixels against rendered pixels.** The reliable test is:
feed ffmpeg the exact JPEG the preview is sampling, render at the preview's own
canvas size, and score the result against a screenshot of the preview
(normalised cross-correlation). Everything below was settled that way, on all
six real saved shots at once. The tempting alternative — reimplement the
shader's maths in another language and check ffmpeg against *that* — was tried
first and produced a confident, wrong answer, because the reimplementation was
itself wrong. It cost a full round of "fixes" that made things worse. Don't
verify a renderer against a model of a renderer.

**1. v360's yaw runs opposite to the aimer's.** Sweeping every combination of
rotation order, per-axis sign, and input flip against the preview: negating
yaw scores 0.997, the runner-up 0.76. Not a close call. `rorder` stays at
ffmpeg's default `ypr`; pitch and roll pass through unchanged.

**2. A lens sees its whole rectangular frame, not an inscribed ellipse.** The
preview masked coverage with `length(x,y) <= 1`; v360 uses `max(|x|,|y|) <= 1`.
Measured directly off v360's own `alpha_mask`, sweeping the coverage boundary
by angle: the rectangle model tracks it to within half a degree, the ellipse
is off by up to **85 degrees** at the frame diagonals, where a square corner
reaches much further than a circle. `ih_fov`/`iv_fov` bound the frame's *axes*;
the corners see well past both.

**3. The preview must blend only when the render will.** A single-lens shot is
rendered from one stream and never composited, so a preview that always
cross-fades both lenses shows footage the file will not contain. The shader now
takes a `uMode` uniform straight from `coverage()` and mirrors what
`filterGraph` will actually build — one lens, the other, or the feathered
composite.

**4. The lens is a circle; the frame is a square.** `alpha_mask=1` marks the
whole rectangular source frame as covered, dead corners included, so a lens
composited through it paints its own black corners over the other lens's good
pixels — measured at 9.5% of one real seam-crossing frame. Each lens is now
masked to its own image circle *before* warping (`circleMask`), and v360
carries that alpha through the warp, so the mask lands already warped and
feathered.

**5. And the calibration itself was impossible.** Two lenses meet only if each
reaches past 90 degrees off its own axis. The stored `iv_fov` was **175** —
five degrees short of even touching, so a band of sphere existed that neither
lens saw, and it rendered black. Re-measured at **190/190** (see `IH_FOV`).
`checkLens` now rejects any sub-180 field rather than rendering a wedge.

Together these took the six saved shots from a mean 0.885 correlation (one shot
at 0.32 — visibly, badly wrong) to **0.992, every shot above 0.985**.

### Two traps that cost more time than any of the bugs

**A stale server serves stale constants.** `serve.mjs` re-reads `app.js` and
`index.html` per request, so browser edits are live — but `IH_FOV` and friends
are `import`ed once and cached by Node for the life of the process. After
changing anything in `lens.mjs`, **restart `aim`**, or the preview will keep
using the old numbers while renders use the new ones, and every comparison
between them is meaningless.

**A test harness that hardcodes what it is testing proves nothing.** The
verification script above carried its own `ih_fov: 187, iv_fov: 175` literal.
After the constants moved to 190/190 it kept scoring renders-at-187 against
previews-at-190 and reporting a mismatch that did not exist in the code — while
three real fixes went in on top of that false signal. It also failed silently
for twenty minutes (a stray backtick inside the shader's template literal broke
the page; the script's exception went to `/dev/null`) and kept scoring against
reference images from before the break, returning *the same number to four
decimal places* three times running. Read the harness's output, and check that
its inputs are fresh, before believing anything it says.

**`dual` is a feathered blend, not a true stitch, and it used to be worse than
that.** The first version stacked both lenses side by side and let v360's
`dfisheye` input sample across the pair. Checked directly against that input's
own `alpha_mask` output: it steps 0 to 255 with no soft edge at all — v360
does no blending of its own, so every dual shot rendered with a **hard cut**
at the seam. `dfisheye` also hard-codes an *equidistant* fisheye model with no
equisolid variant, so it silently sampled equisolid lenses too close to axis —
about 7% tighter than the aimer's own preview (measured: a 122.8 degree
framing rendered like 114).

Each lens now crops straight to the output instead — no dfisheye, no re-warp.
Each is masked to its own image circle first, and v360 carries that alpha
through the warp, so the feather arrives in output space for free:

```
[0:v:0]split[i0][m0];[i0]format=yuv444p[c0];
[m0]format=gray,geq=lum='<circle>'[k0];[c0][k0]alphamerge,v360=...[base];
[0:v:1]split[i1][m1];[i1]format=yuv444p[c1];
[m1]format=gray,geq=lum='<circle>'[k1];[c1][k1]alphamerge,v360=...[top];
[base][top]overlay=format=auto,format=yuv420p[o]
```

Three details in there are load-bearing and all three fail *silently*:
`format=yuv444p` on the image branch (`split` cannot give its outputs different
pixel formats, so without it ffmpeg negotiates everything down to the mask
branch's `gray` and the render comes out black and white); the one-plane gray
mask rather than a four-plane `rgba` `geq` with r/g/b passed through (the
expression runs per pixel *per plane*); and the trailing `format=yuv420p`
(`overlay` hands on an alpha channel and `hevc_videotoolbox` refuses to encode
one, dying with a bare "Invalid argument" and no packets).

Costs two full-resolution v360 passes plus the per-pixel mask — about 1.5 fps
at 4K on an M-series, against ~9 fps before. Only `dual` shots pay it; single
lens shots are one plain v360 with no mask at all. Worth it: the seam is
exactly where a viewer's eye goes first. `interp=lanczos` (v360 defaults to
bilinear) rides along on every shot for a bit more sharpness at no real cost.

The renderer builds this from `filterGraph`, so the CLI can't drift from
itself. The aimer's copyable command **can't** import that module — it's
browser JS, `filterGraph` is a Node file — so `app.js` keeps a hand-written
copy in sync by hand. That gap is exactly how the yaw flip above went missing
from the copyable command for a while without anyone noticing (a `lens0` shot
copied out of the aimer rendered solid black). Treat any change to
`filterGraph` or `v360Filter` as two edits, not one, until this gets a real
fix — shipping `lens.mjs` to the browser, or generating `app.js`'s copy from
it at build time.

The same applies to the preview shader, which is a *third* implementation of
the projection. `v360Filter`, `app.js`'s `ffmpegCmd`, and the GLSL in `FS`
all have to agree, and only the correlation test above will tell you when they
don't.

## Scrubbing and marking clips

A long session recording is rarely one clean shot: drivers swap, the camera
gets moved off the car mid-session, runs are interleaved with paddock time.
The aimer's **05 Scrub & mark clips** section is for finding those cuts by
eye, not guessing at them from an audio envelope or a handful of contact
sheets — both were tried on real footage and neither was trustworthy enough
to cut on alone.

It is a filmstrip, not a video element: an `.insv` is dual-fisheye and no
browser decodes that natively, so `aim` cuts a still every `--scrub-interval`
seconds (default 15) in the background as soon as the server starts. Dragging
the scrub range re-points the *same* live preview textures at whichever frame
pair is nearest, so scrubbing looks through the current aim rather than at a
flat, unwarped image — the mount-move moment on a clip, the exact instant a
door opens, are all visible as *framed* footage, the same as the aimer's
normal preview.

Set a clip in and out, a camera position (`interior` / `exterior` /
`transition`), and an optional driver and note, then add it. Save writes
`<clip stem>.clips.json` beside the clip:

```json
{
  "schema": "oio-clips/1",
  "clip": "VID_20180101_002138_00_001.insv",
  "clips": [
    { "id": "clip-1", "camera_position": "interior", "in": 0, "out": 865,
      "driver": null, "note": null, "confidence": "human" }
  ]
}
```

The filmstrip is cached next to the clip as a hidden `.scrub-<stem>-<interval>s/`
folder, so reopening the same clip at the same interval reuses it instead of
re-cutting. `--no-scrub` skips extraction entirely (e.g. when only the aim
matters and the clip is long). Extraction needs the real clip, so it is
unavailable in `--frames`-only mode.

## Commands

```
aim       (--input <clip.insv> | --frames <dir>) [--aim <path>] [--port 5173] [--at <sec>]
                                [--scrub-interval <sec=15>] [--no-scrub] [--clips <path>]
render    --config <aim.json> (--input <clip> | --input-dir <dir>)
          [--shot <name>]... [--preview] [--dry-run] [--overwrite]
          [--project <dir>] [--outdir <dir>]
frames    --input <clip.insv> --outdir <dir> [--at <sec>]
calibrate --input <clip.insv> [--pitch 35] [--from 180] [--to 210]
```

## Audio

The camera's own master runs about **-9.2 LUFS** - far too hot - and once the
car moves, broadband roar fills 200 Hz to 16 kHz and buries the voices. The
engine sits at 20-170 Hz; speech in harmonic combs at 300-4000 Hz. So the
problem is **masking**, not hiss, and the treatment is a three-band split:
engine levelled and kept, speech lifted and left uncompressed, roar compressed
hard and pulled back. Measured on real X1 in-cabin footage that takes
speech-to-roar from **5.8 dB to 18.5 dB**.

**On by default for every clip.** The masking is a property of filming a car
from inside it, not of any one car, so it is not a flag anyone has to remember.
Override per shot (or per config) next to `colour`:

```json
"audio": { "enabled": false }
```

**Two things that do not work here, both tried and measured:**

- **`afftdn` at light settings is a no-op** - speech share 66.9% before, 66.9%
  after. It tracks a *stationary* noise floor and this roar is not stationary.
- **A single full-band compressor makes it worse.** It hears one level for the
  whole spectrum, so it lifts the quiet low end: the engine's share went 7.9% to
  14.8% while speech-to-roar *fell* 0.6 dB.

`arnndn` is never used: its models are speech-trained and treat the engine as
the noise.

**The notch is measured, not assumed.** It exists for a ~12.4 kHz whistle
specific to ONE car - on the same X1 body the MGB puts ~69% of its above-4 kHz
energy in 11-14 kHz, the Fit ~19%, the X4 ~8%. Defaulting it on would carve a
hole in every car's audio to fix one car's problem, and defaulting it off would
miss the car that needs it. So `notch: "auto"` asks each clip, once, before its
shots render, and says what it decided:

```
audio: 11-14kHz is 65.6% of the >4kHz energy - notching the whistle
audio: 11-14kHz is  7.6% of the >4kHz energy - no whistle, leaving the top alone
```

Measured with a real FFT (`detectWhistle`), hand-rolled rather than done with
ffmpeg filters, because both filter routes gave wrong answers: one bandpass is
12 dB/octave and leaks so much of the far louder rest of the spectrum that the
MGB read 36% against the FFT's 69%, while cascading filters steep enough to stop
the leak eat the passband - 11-14 kHz is only ~0.35 octaves wide, so the slopes
meet in the middle and every clip read under 1%. A transform has no corners.

Where it does fire, notch rather than shelving the whole top: cutting everything
above 4 kHz removes the squeak but takes the consonants and the gravel-and-dust
texture with it. A/B on one clip - 11-14 kHz falls 0.945% to 0.107% of total,
while 4-11 kHz *rises* 0.749% to 1.013%, because loudness normalisation gives
back what the whistle was eating.

Audio needs `acrossover`, which has three outputs, so it cannot ride in an
`-af` chain - and ffmpeg refuses `-vf` alongside `-filter_complex`. When audio
is on, the video therefore goes into the complex graph too, even for a
single-lens shot that would otherwise be a plain `-vf`. Both paths are verified
to produce identical audio.

## Equirect masters

The tool takes two kinds of source, and works out which from the footage:

| source | how it is recognised | what it is |
|---|---|---|
| dual fisheye | two video streams, or a `_00_`/`_10_` pair | straight off the camera |
| **equirect** | **one stream at 2:1** | a stitched 360 master, e.g. an Insta360 Studio 8K export |

Shape, not extension: an `.insv` is always fisheye and an equirect is always
2:1, so nothing has to be flagged. An equirect takes the single-stream path -
`v360 input=e`, no seam mask, no overlay, and **no `ih_fov`/`iv_fov`**, because
those describe glass and this frame left the glass behind.

**Why bother, when rendering from the fisheye keeps more detail?** Because it
keeps more *grain* with it, and grain is what was actually objectionable.
Measured on the same shot, same anchor (the car's painted hood):

| | hood luma noise |
|---|---:|
| rendered from the raw fisheye | 4.17 |
| rendered from a Studio 8K equirect | **2.49** |

Studio denoises temporally, using the gyro track to motion-compensate. Nothing
in an ffmpeg graph can do that - `atadenoise` was tried and made it worse,
because temporal filters want still pixels and nothing in a moving car holds
still. The equirect costs ~9-12% detail through the extra resample; it removes
roughly 40% of the noise. That trade is better than any local denoiser managed
(about 1 unit of detail per 1.2 of noise).

Denoise defaults to **off** on an equirect, and that is deliberate rather than
an oversight: `resolveCamera` matches no body (there is no lens to profile), so
the fallback is 0/0, and Studio has already done the cleanup. Denoising again
would cost detail cleaning something clean.

### An equirect aim is not a fisheye aim

**They do not transfer, in either direction.** Rendering the same shot from both
scored **0.04** normalised cross-correlation - a different direction entirely,
not a near miss.

Studio's export is horizon-levelled. The raw fisheye sphere carries however the
camera was bolted on (on Fergus: roll -105.5, pitch -25.9); the equirect has had
exactly that removed and arrives upright. A fisheye aim *encodes* the mount
tilt, so applying it to a levelled sphere tilts it twice.

The upside is that an equirect aim is easier: **roll near 0, a small pitch, and
yaw doing the work.** The lens0 `+180` flip still applies - it is about which
half of the sphere the shot looks into, not about the mount. Verified: a
`lens0` shot at yaw -165 and a `lens1` shot at yaw +15 both render v360 yaw -15
and both score **0.9957** against a known-good forward frame.

### Aiming one, before the aimer speaks equirect

The aimer's preview shader samples two fisheye stills, so until it learns
equirect directly, rebuild the stills from the master and use `--frames`:

```
ffmpeg -ss <t> -i master.mp4 -frames:v 1 \
  -vf "v360=input=e:output=fisheye:h_fov=194:v_fov=181:yaw=0:w=3840:h=3840" lens0.jpg
ffmpeg -ss <t> -i master.mp4 -frames:v 1 \
  -vf "v360=input=e:output=fisheye:h_fov=194:v_fov=181:yaw=180:w=3840:h=3840" lens1.jpg
360-framer aim --frames <dir> --aim <dir>/aim.json
```

**Build them at yaw 0 and 180 or the aim is silently offset by whatever you used
instead.** There is no filmstrip in `--frames` mode (no clip to seek into), so
re-cut the stills at a different `-ss` to aim on a different moment.

### Finding masters in a folder

`isMaster` accepts `.mp4`/`.mov` alongside `.insv`, which means a folder is also
full of this tool's own renders. Those are excluded by WHERE they sit -
`renders/` and `render-previews/` are its own output directories - rather than
by name, because names are typed by hand and drift while directories do not.
Anything flat that still slips through fails in `lensSources`, which only
accepts a 2:1 single stream as a sphere.

## Grain

What reads as "grainy" on this footage is mostly **chroma speckle** - coloured
confetti in flat areas - and the grade multiplies it, because `shadow` and
`contrast` amplify exactly that. So denoise runs **after the warp and before
`colourChain`**: clean it at its own amplitude, not at the amplitude the grade
gave it. Same argument that puts the LUT after the tone sliders, in reverse.

On by default per body, from `cameras.json`, for the same reason the audio
treatment is: the speckle is a property of the sensor and its bitrate, not of
any one shot.

```json
"denoise": { "luma": 0, "chroma": 10 }          // the X4 default
"denoise": { "enabled": false }                 // this shot wants none
"denoise": { "chroma": 8, "extra": "bm3d=sigma=3" }   // hero shot
```

`luma` and `chroma` are hqdn3d spatial strengths; the temporal pair is derived
at 1.2x rather than exposed, because the two are not independent in practice
and the measured setting sits on that line.

**MEASURING THIS NEEDS A FLAT SURFACE THAT IS REALLY FLAT**, and the first
attempt failed on exactly that. Anchored on tarmac, every technique scored
within 4% of doing nothing - asphalt aggregate is real detail and the metric
could not tell it from noise. Anchored on the car's own **painted hood**, where
any high-frequency detail is by definition noise, the same measurements
separate cleanly:

| | luma noise | edge detail | chroma speckle |
|---|---:|---:|---:|
| `chroma` 10 | -8% | +2% | **-39%** |
| chroma + `bm3d` | -15% | -3% | -40% |
| `fftdnoiz` sigma 3 | -18% | -14% | -28% |
| `vaguedenoiser` 3 | -20% | -16% | -30% |
| `nlmeans` s=3 | -27% | -22% | -42% |

**Chroma is nearly free; luma is not.** Everything touching luma pays about one
unit of real detail per 1.2 units of noise, which is a per-shot call rather
than a default - hence `luma: 0` out of the box. `hqdn3d` rather than anything
cleverer is a throughput decision: it runs at realtime on a 4K stream, where
bm3d measured **~4 hours per 115-second shot** and nlmeans worse. bm3d has the
best ratio in that table (5:1, after the chroma pass) so it is reachable
through `extra`, but it is a hero-shot tool, not a batch setting.

Two things that do NOT work, both measured rather than assumed:

- **`atadenoise` made it worse on both counts** (+8% noise, +10% detail, which
  is just sharpening). It is temporal and it wants still pixels; nothing in a
  camera bolted to a moving car holds still.
- **Sharpening afterwards to "put the detail back" loses.** `cas=0.4` after
  bm3d scored +34% noise for +21% detail - most of what it returns is the
  grain you just paid to remove.

### The one thing the preview does not show

Every colour control exists in closed form precisely so the shader can compute
the identical thing per pixel. A denoiser reads a neighbourhood, and
temporally, other frames - so **no shader can honestly mirror it**. The choice
is between a preview that lies and a preview that says it is not showing this,
and the second is the one that keeps *Keeping the preview honest* intact.

So: `render` prints what it applied, and **Render frame** goes through the real
pipeline (`shotArgs` threads `denoise`, resolved by the same rule as the CLI),
which makes that button the honest preview of a denoise. A proof that skipped
it would be the exact drift the button exists to catch.

## Test slices

`--start <sec> --duration <sec>` renders a slice instead of a whole clip. A
12-minute master across three shots is not a test.

```
360-framer render --config aim.json --input clip.insv --start 40 --duration 30
```

Note where those two land in the argv, because both have bitten:

- **`-ss` goes before EVERY `-i`.** As an input option it applies only to the
  next one, so on a body that splits its lenses across two files a single `-ss`
  seeks lens0 and leaves lens1 at zero - a dual shot then blends two different
  moments, with no error anywhere.
- **`-t` goes AFTER every `-i`**, so it limits the output. Before an input it
  trims that input instead, and the only input it would trim is the
  single-frame seam mask, which does nothing - so a dual shot ran to the end of
  the clip while a single-lens shot stopped correctly. That asymmetry is the
  tell.

## Where renders land

The two kinds of output want opposite things, so neither has to be named.

| | Goes to | Why |
|---|---|---|
| final | `renders/` beside the clip | it is a deliverable and belongs with its footage; a batch across `x4/hudson`, `x4/miles` writes one `renders/` per source folder |
| `--preview` | `<project>/render-previews/` | scratch, watched once and replaced, and far more useful pooled in one place |

`--project` sets the project root (default: the current directory).
`--outdir` overrides both. `aim.json` is copied into every directory written,
so a file can always be traced back to the aim that produced it.

Aiming only ever touches two jpgs, so `aim --frames <dir>` reuses stills pulled
earlier (`lens0.jpg` + `lens1.jpg`, from `frames`) and keeps the aimer usable
when the drive holding the footage is unmounted. `--input` still decides where
`aim.json` lands — an aim belongs with the footage, not with the scratch stills
— and only falls back to the stills dir when the clip is not readable.

The aimer's shot list is a gallery: each card renders its own framing through
the same shader as the live preview, so the list shows pictures rather than
angles to imagine. **Open aim.json** loads any config from disk (Save still
writes to the path the server was started on, and says so).

### Render this frame

**Render frame** runs the aim on screen through the real pipeline and shows the
result under the preview, at the filmstrip's current position. It is the answer
to "is the shader lying to me": the frame above it is GLSL, the frame below it
is ffmpeg, and they are on the same page at the same size.

The command underneath comes from the *server*, not the browser. It used to be
assembled in `app.js`, which made it a second implementation of `filterGraph`,
free to drift from the one that renders — and it had:

- placeholder `INPUT.insv` / `OUT.mp4` paths, so it could not be run as shown;
- hard-coded `[0:v:0]` / `[0:v:1]`, which is the **X4's** both-lenses-in-one-file
  layout. On an X1, whose lenses are two separate files, those labels name the
  same lens twice and the command renders nonsense.

`POST /frame` now builds both the command and the proof from `filterGraph` +
`lensSources`, and the string shown is the exact argv, shell-quoted (the graph
is full of `[`, `'` and `;`, and `-map [o]` is a glob to a shell). `{dry: true}`
returns the command without running ffmpeg, which is what the live display asks
for as the sliders move. Deliberately built with the *inline* mask rather than
the prebuilt one the CLI uses: the prebuilt mask is a temp file that only exists
inside the server process, so a command naming it would paste as a command that
cannot run — the exact failure being fixed. It writes to `~/360-framer-renders/`,
not next to the footage: the working drive is slow, and a render is a proposal
until it has been looked at.

Aiming from stills (`--frames`) has no master to seek into, so the button says
so instead of failing when pressed.

`--preview` renders 1080p/H.264 proofs instead of 4K/HEVC — worth doing across a
folder before committing to the full pass. `--shot` is repeatable. Existing
outputs are skipped unless `--overwrite`. `.lrv` proxies are never treated as inputs, and
neither is a `_10_` half on its own — on a body that splits its lenses it is
picked up automatically as the second input to its `_00_`.

```
360-framer render --config x4/hudson/aim.json --input-dir x4 --preview
```

Rendering runs about realtime at 4K on Apple silicon via `hevc_videotoolbox`.

## Aiming across clips

`ih_fov`, `iv_fov` and the lens model belong to the body, not the clip, and are
exposed in the aimer's **Lens calibration** section so a different one can be
set up without editing code. The two axes are independent — and on the X4 they
are deliberately *unequal*: **194 / 181**, which is a look, not a measurement.
The glass is round (the lit circle on a real frame measures round to within
0.1%), so a vertical field 13 degrees under the horizontal is an anamorphic
squeeze on top of the projection. It is there because it is what stops the
in-cabin shots reading domed. `cameras.json` says so in its own notes, and
carries the physical figure (~196.5) alongside.

Two things follow from that, and both were found the hard way:

- **`iv_fov` must stay above 180.** `checkLens` rejects anything at or below and
  substitutes the fallback, so a saved `180` renders at 190/190 with only a
  printed note — it looks like the setting didn't take.
- **The seam mask must not be derived from the fields.** It marks where the
  glass put light, which is a circle regardless of what the calibration claims.
  Normalising each axis by its own field made it an *ellipse*, which trimmed the
  top and bottom off each lens circle — exactly where an in-cabin seam runs. At
  194/181 that left **49 pixels** of overlap band and **663 pixels covered by
  neither lens**, a strip along the top of frame; round, the same aim gets
  **3464** of overlap and none uncovered. It only ever bit once the two fields
  differed, which is why it survived until they did.

A config written before `iv_fov` existed falls back to `ih_fov`. Yaw,
pitch and roll are just where the mount was pointing, so they can drift between
clips and will differ if the camera was re-seated between sessions. Re-aim when
the mount moved; reuse the same `aim.json` when it did not.
