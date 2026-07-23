# @oio/event-kit

Turns a dump of raw event media into a fingerprinted manifest the rest of the
post pipeline selects from. This package is **step 1** of the event-kit plan
(ingest + manifest); rendering/publishing already live in `@oio/social-card`
and `@oio/video`.

No npm dependencies — it drives system binaries: `ffmpeg`/`ffprobe`,
ImageMagick (`convert`/`identify`), `whisper`, `python3` + numpy, and `brctl`.

## Usage

```bash
# 1. (optional) pull media you dropped into THIS Claude Code chat into staging
node src/cli.mjs adopt --staging "<staging dir>"          # newest chat session
node src/cli.mjs adopt --staging "<staging dir>" --all    # every session

# 2. re-run this as often as you like; only new/incomplete assets do work
node src/cli.mjs ingest --event ~/OIO/events/2026-08-02-kcrx-e6 \
                        --staging "~/Library/Mobile Documents/com~apple~CloudDocs/OIO Event Drop"

node src/cli.mjs status  --event <dir>
node src/cli.mjs state   --event <dir> --asset <fingerprint> --set selected
node src/cli.mjs cleanup --event <dir> [--dry-run]
```

Options: `--slug`, `--model <whisper model>`, `--min-speech <seconds>`, `--skip-audio`.

## Getting media in (three routes)

**1. From the phone — a Photos album. Easiest, and the default.**

```bash
node src/cli.mjs albums --create "OIO Event Drop"   # once, ever
node src/cli.mjs pull-album --event <dir> --album "OIO Event Drop" --staging <dir>
```

On the phone it's two taps: select photos/videos → **Add to Album**. No Files
app, no folder to create or navigate. iCloud Photos syncs the album to the Mac,
where Photos.app is scriptable, so `pull-album` exports the new items straight
into staging.

- Exports **originals**, so 4K/120fps video arrives at full quality, not a preview.
- **Incremental** — pulled media-item ids are remembered in the manifest, so a
  re-pull after adding three photos moves three files, not the whole album.
- **Live Photos are handled.** Photos exports them as a pair
  (`IMG_0038.HEIC` + `IMG_0038.mov`); that .mov is a ~3s silent motion
  component, not footage, and is skipped so it never enters the clip pool.
- First run triggers a one-time macOS automation permission prompt.

There is no Google Photos connector (checked the MCP registry 2026-07-22) and
no iCloud connector — the bridge is the *local* Photos library, so this only
works on the Mac. Claude cannot create or manage albums/folders on the phone
itself.

**2. On the Mac — drop it in the chat.** Files attached to a Claude Code session
are written to `~/.claude/uploads/<session-id>/` as real files on the real disk.
`adopt` copies them into staging (stripping Claude's hash prefix, deduping by
content). No cloud hop at all.

**3. iCloud Drive folder.** Still supported — point `--staging` at the folder.
Create it **once**; `ingest --event` makes the per-event folder itself.

## Event folder

```
<event>/
  manifest.json     per-asset state, keyed by content fingerprint
  normalized/       upright stills (see EXIF note)
  sheets/           one contact sheet per clip
  audio/            extracted wav (cleanup fodder)
```

## Lifecycle

`new → selected → rendered → posted`, or `rejected`. Plus `stub` — iCloud
hasn't handed over the bytes yet, so a re-run retries it.

`cleanup` deletes derived media for **`posted` and `rejected` only**. Never
`new`. Source files in staging are never touched, and manifest rows always
survive — the record outlives the bytes.

## Things that will bite you (all learned the hard way)

**EXIF orientation.** `@napi-rs/canvas`'s `loadImage` does not apply EXIF, which
silently sideways-rendered every phone photo at the 2026-07-19 Winston session.
Ingest always writes an upright copy to `normalized/`; downstream should use
that, not the source.

**Whisper hallucinates over engine noise.** Ungated, it invents dialogue. A real
OIO rallycross clip (pure exhaust, no speech) transcribed as *"That's all for
now. Thanks for watching. I'll see you in the next one. Bye bye."* Run
ungated across an event and you manufacture phantom dialogue bundles.

So audio is **VAD-gated first** (`vad.py`). No webrtcvad/torch on this box, so
it's a numpy heuristic — and the discriminator that actually works is
**syllable-rate (2-8 Hz) amplitude modulation**, not loudness:

|                | modulation | speech_ratio | band_ratio |
|----------------|-----------|--------------|------------|
| rallycross run | **0.222** | 0.294        | 0.457      |
| someone talking| **0.450** | 0.227        | 0.418      |

Note the engine clip scores *higher* on the two energy-ish measures — any gate
built on loudness passes it. Threshold sits at 0.32, between the two measured
values. Only two samples so far; retune as more event audio arrives.
Whisper output is *also* filtered for known hallucination phrases, as a second line.

**Word-level timestamps** (`--word_timestamps True`), not segment-level —
segments are too coarse to time a caption card against, and cards drift off
the speech.

**Capture rate is classified, not just measured.** Cameras report NTSC rates as
29.97 / 59.94 / 119.88, so a raw fps compare calls a 30fps clip "29.97" and is
useless for deciding whether slow motion is on the table. Ingest snaps to a
nominal rate and records what slow motion is actually available:

| measured | captureClass | slow-mo to 30fps |
|----------|--------------|------------------|
| 24       | `24fps`      | none             |
| 29.97    | `30fps`      | none             |
| 59.94    | `60fps`      | 2x               |
| 120      | `120fps`     | 4x               |

`slowMo.available` is false for 24/30fps material — there is no slow motion
without frame interpolation, and pretending otherwise produces judder.

**High-fps clips carry two durations.** A 120fps capture's real-time duration
and its playback duration differ by up to 5x (a 3s capture is 12s conformed to
30fps). The manifest records `realTimeSeconds`, `durationSeconds`, and
`slowMo.conformedSeconds30/24`, because the recap word budget and contact-sheet
sampling both depend on the distinction.

**Contact sheets, not loose frames.** One tiled JPEG shows a clip's whole arc —
a car going sideways-to-backwards reads across three cells. ~8x cheaper in
context than loose frames *and* higher signal, since a wipeout is a motion
event that a single mid-spin frame misreads as hard cornering. The grid is
sized to the sample count, so short clips aren't mostly black padding.
