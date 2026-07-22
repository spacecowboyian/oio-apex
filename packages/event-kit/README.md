# @oio/event-kit

Turns a dump of raw event media into a fingerprinted manifest the rest of the
post pipeline selects from. This package is **step 1** of the event-kit plan
(ingest + manifest); rendering/publishing already live in `@oio/social-card`
and `@oio/video`.

No npm dependencies — it drives system binaries: `ffmpeg`/`ffprobe`,
ImageMagick (`convert`/`identify`), `whisper`, `python3` + numpy, and `brctl`.

## Usage

```bash
# re-run this as often as you like; only new/incomplete assets do work
node src/cli.mjs ingest --event ~/OIO/events/2026-08-02-kcrx-e6 \
                        --staging "~/Library/Mobile Documents/com~apple~CloudDocs/OIO Event Drop"

node src/cli.mjs status  --event <dir>
node src/cli.mjs state   --event <dir> --asset <fingerprint> --set selected
node src/cli.mjs cleanup --event <dir> [--dry-run]
```

Options: `--slug`, `--model <whisper model>`, `--min-speech <seconds>`, `--skip-audio`.

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

**High-fps clips carry two durations.** A 120fps capture's real-time duration
and its playback duration differ by up to 5x. The manifest records
`realTimeSeconds` and `durationSeconds` (plus `conformedSeconds30`) because the
recap word budget and contact-sheet sampling both depend on the distinction.

**Contact sheets, not loose frames.** One tiled JPEG shows a clip's whole arc —
a car going sideways-to-backwards reads across three cells. ~8x cheaper in
context than loose frames *and* higher signal, since a wipeout is a motion
event that a single mid-spin frame misreads as hard cornering. The grid is
sized to the sample count, so short clips aren't mostly black padding.
