---
name: oio-social-leaderboard
description: Build a narrated OIO rallycross leaderboard recap for social, from event results and footage through to published video. Use when Ian says he wants a leaderboard recap, a social leaderboard, or an event recap video for a rallycross or autocross event.
---

# Social leaderboard recap

Turns event results plus footage into a narrated vertical recap and publishes it
to Instagram, Facebook and YouTube.

Seven stages. They run **minutes to hours apart**, often across separate
sessions, so all state lives in a **job manifest** on disk rather than in
context. Every stage reads it and writes it back. Resuming means reading the
manifest and picking up at the first unfinished stage, not starting over.

Background and the reasoning behind every locked decision below:
Brains `projects/oio/projects/apex/canonical/social-leaderboard-recap-pipeline.md`.
The target working style is Brains `social-leaderboard-skill-goal.md`.

## The prime directive

**Ian is never the one waiting.** Renders are minutes long. Start every piece of
compute the moment its inputs exist, not when its output is needed.

The single most important instance: **the board render depends only on the
results.** Not the script, not the clips, not the audio. Kick it off as soon as
the results parse, in the background, and it will be sitting on disk long before
stage 6 wants it. Do not leave it until stage 6.

## Checkpoints

Stop and get Ian's answer at these. Everywhere else, proceed.

1. **Script** — show the per-card text and get approval before anything renders.
   This is a locked rule, not a preference.
2. **Clip layout** — he picks the clips. Hand him the tool, wait.
3. **Audio pick** — play both versions, let him choose. Never pick for him.
4. **Publish** — never post without an explicit go. Staging a draft is fine.

## Stage 1 — Results and media

Both arrive from the event. **Neither stage 2 nor stage 3 can start until both
are in hand**, but the board render only needs the results, so it starts here.

Results come as a link or a paste. Parse them:

```
node scripts/parse-results.mjs <url|file.html> --class MR \
  --featured Ian,Larry,Ryan --event-date 7.19.26 --roster roster.json \
  --out leaderboard-configs/<event>.json
```

- **Never hand the page to a summarizing fetch.** That dropped a whole run and
  garbled figures on E5. The script reconciles per run and refuses to emit if
  the numbers do not balance.
- **Rallycross only.** Autocross and track rank on best lap and carry no
  cumulative total, so they need their own reader. The script says so rather
  than guessing.
- **Reconcile per run, not on totals.** A transposition bug in the E5 config had
  two of Larry's runs swapped with wrong cone flags; the errors cancelled, the
  total still matched, and every intermediate board from run 5 on was wrong
  while looking right.
- **Times are credited** — cone penalties already added. A gap on the board is
  therefore not a pace difference, and any script line comparing drivers has to
  be clear which it means.
- DNFs score as slowest in class plus ten (SCCA rallycross).

Write the leaderboard config to `packages/video/leaderboard-configs/<event>.json`.
The data contract is in `packages/video/README.md`. Note that `resolveConfig` in
`Leaderboard.tsx` is a **whitelist**: a new field must be added in two places or
it is silently dropped.

Then immediately, in the background:

```
node scripts/render-board-overlay.mjs <config.json> <work>/board.mov LeaderboardRunSequence
```

Footage: copy into a pool directory. macOS TCC blocks Bash from `~/Desktop`, so
bridge with osascript and Finder, or have Ian drop files in a synced folder.

## Stage 2 — Script

One block per card. The read defines the card boundaries at stage 6, so **never
write to a target duration** — write the story and let it land where it lands.

- Third person, narrator voice.
- **No em dashes, ever.**
- **"Course", never "track".** Rallycross has no such distinction.
- Ian reads about 189 wpm; use it to sanity check length, not to constrain.
- Ryan, Larry and Ian are the featured drivers; others are also-rans and get a
  mention at most. Be honest about results without piling on.

Expect a rewrite. E5 went to v3.

**Checkpoint: show him the blocks.**

## Stage 3 — Clip layout

```
npm run clip-layout -- --pool <pool> --card <seconds> --speed 0.2
```

Ian picks order, crop, and a **centre time** per clip. Writes `layout.json`.

The centre is the whole design. When a card's length changes at stage 6, the
source window grows or shrinks around the same moment instead of drifting off
the action. Never convert this to in/out points.

The entry card holds three clips; each run card takes one; the last card takes
the last clip. 120fps footage plays at 20%.

**The tool backs up `layout.json` on every write.** Never press Save on Ian's
folder yourself — his layout was destroyed twice that way and the loss could not
be proven either way afterwards.

**Checkpoint: he does this, not you.**

## Stage 4 — Record

Ian reads the approved script in one take. Flubs stay in and get cut at stage 5
rather than punched in, which keeps the read's momentum. He speaks retakes back
to back with the duff one first.

## Stage 5 — Audio

Transcribe with word timestamps, which is what makes flub-accurate cutting
possible:

```
whisper <take> --model large-v3-turbo --language en --word_timestamps True --output_format json
```

Budget ~0.6x realtime (94.6s for a 152s take on an M3 Max). This is on the
critical path; nothing else is waiting on Ian here, so start it the instant the
file lands.

Read the transcript, find the flubs and the retakes, and write
`manifest.audio.keepers` as the segments to keep **in final order**. That order
need not be chronological: on E5 the keeper "Oh, there he is, right there" is
lifted from the first delivery and dropped in later, because the second take
said "Oh, actually". Keeper selection is editorial, so if Ian has asked for a
specific line, keep it.

```
node scripts/recap-vo.mjs <manifest.json>
```

This snaps every cut to real silence, fades 20ms per segment, assembles, and
renders both a straight and a mastered version with their measurements.

**Checkpoint: play both, let him pick, set `manifest.audio.pick`.** He prefers
the raw mic, but that is about tone and does not solve level: straight typically
lands near -24 LUFS against the -14 platforms expect, and gain alone cannot
close that. Give him the numbers and the choice.

Then derive `manifest.cards` from the finished read: transcribe it, find where
each card's first line starts, and set the boundary **slightly before** it.

## Stage 6 — Video

```
node scripts/recap-board.mjs <manifest.json>     # retime the board to the read
node scripts/recap-render.mjs <manifest.json>    # footage, composite, delivery encode
```

The board is retimed by editing **holds only** — trimmed by cutting frames from
the static hold, extended by freezing on it. Transitions always play at native
speed. **Never speed-ramp**: it reads instantly as a speed change, where a
longer hold is invisible.

Target the board changing **slightly before** its line. On E5 every card lands
+0.04 to +0.54s ahead. Board turns, then the voice arrives.

**Verify by transcribing the finished video** and measuring each cue against its
cut point. Sampled frame checks miss timing and ordering bugs. Then look at a
frame from every card, because a correct-sounding cut can still be visually
wrong.

## Stage 7 — Publish

Caption: **short**. Write the YouTube Shorts title first and expand slightly for
IG and FB, not the other way round. YouTube gets its own title and description
plus `#Shorts`. Hashtags follow the house set: `#rallycross #kcrx #kcrscca #scca
#modifiedrear` plus car tags plus `#oioracing #grassrootsmotorsport`.

Publish with Post-Bridge (accounts: 50547 IG, 50528 FB, 50526 YouTube).

**The delivery encode must be ~40 MB.** `recap-render.mjs` already targets
CRF 24 / maxrate 6M. A 100 MB master fails Facebook with a bare "Failed to
process video" while IG and YouTube accept it. Full detail in Brains
`canonical/postbridge-video-publishing.md`, including the staging route for
files over the 3 MB direct-upload cap and the `is_draft` un-draft quirk.

**Checkpoint: explicit go before anything publishes.** Check `list_post_results`
afterwards; a post can report `scheduled` and still fail per platform.

Finally, generate and publish the build record:

```
node scripts/recap-artifact.mjs <manifest.json>
```

It writes HTML from the manifest, one section per stage in the order the stages
ran. Publish it with the Artifact tool so Ian has the event documented on his
phone. A stage with nothing recorded says so rather than being omitted, so fill
in `script`, `media`, `record`, `verify` and `publish` as you go rather than at
the end.

## Manifest shape

```jsonc
{
  "event":  { "name": "KCRX Event 5", "date": "7.19.26", "slug": "...", "class": "Modified RWD" },
  "config": "…/leaderboard-configs/<event>.json",
  "pool":   "…/pool",              // footage
  "layout": "…/pool/layout.json",  // from the clip layout tool
  "work":   "work",                // everything generated lands here
  "fps": 30,
  "frame": { "w": 1080, "h": 1920 },
  "box":   { "w": 1080, "h": 900, "y": 1020 },   // where footage sits under the board
  "entryCardClips": 3,
  "labels": { "1": { "fact": "MGB GTS", "name": "RYAN" } },  // by entry-clip index
  "delivery": { "crf": 24, "maxrate": "6M" },
  "audio": {
    "raw": "…", "pick": "mastered", "tail": 117.2,
    "keepers": [ { "in": 0, "out": 36.48, "note": "…" } ],    // FINAL order
    "dropped": [ "the run-3 attempt where the name got said twice" ]
  },

  // Written as you go; the build record renders from these.
  "media":   [ { "what": "iPhone", "note": "120fps, played at 20%" } ],
  "script":  [ { "id": "entry", "text": "…" } ],             // one per card
  "record":  { "device": "DJI Mic 2", "seconds": 151.89, "wpm": 189 },
  "verify":  [ { "id": "run1", "voiceAt": 16.96 } ],         // from the finished cut
  "publish": { "caption": "…", "youtubeTitle": "…", "youtubeDescription": "…",
               "links": [ { "platform": "Instagram", "url": "…", "detail": "…" } ] },
  "board": { "source": "…/board.mov", "cards": [0, 16, 29.4, …] },  // in the RENDER
  "cards": [ { "id": "entry", "start": 0, "end": 16.8 } ]           // from the VOICE
}
```

`board.cards` are boundaries in the rendered board; `cards` are boundaries in
the finished read. Stage 6 maps one onto the other.

## Known traps

- `previousThroughRun: 0` is falsy and returns FINAL standings. Build the
  from-state explicitly.
- Column widths must be measured from the **unsliced** config, or a later run's
  wider number bumps the layout mid-sequence.
- `fontScale` and any other prop must be in the overlay renderer's whitelist or
  it is silently dropped and the component default is used.
- Use Playwright, not just `remotion still`, for anything Storybook or
  CSS-layout adjacent.
- zsh arrays are 1-indexed.
