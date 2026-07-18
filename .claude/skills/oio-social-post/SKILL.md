---
name: oio-social-post
description: >-
  Turn OIO vehicle photos dropped in chat into an Instagram/Facebook post.
  USE THIS SKILL when Ian invokes it explicitly (`/oio-social-post` or "new
  social post") and then drops or points at photos. Handles staging the
  photos with a corner-label + caption prefill, opening the crop-adjustment
  UI, and publishing to Post-Bridge once Ian approves. Do NOT trigger this
  automatically just because photos were dropped in chat for some other
  reason — it's explicit-invocation only.
user-invocable: true
argument-hint: "[vehicle name, optional] — then drop or point at photos"
allowed-tools:
  - Bash(node video-components/scripts/stage-inbox.mjs *)
  - Bash(open *)
  - Bash(curl -s http://localhost:6007/*)
---

# OIO social post skill

Turns "here are some photos of Betty" into a staged, brand-styled Instagram/Facebook
post that Ian approves in the browser and Claude publishes on request.

Architecture and the reasoning behind it: `projects/oio-apex/canonical/oio-apex-social-generator.md`
in Brains (mirrored to local memory as `oio-social-post-generator`). Read it if this is your
first time running the skill this session — don't re-derive the design from scratch.

Repo: this skill lives in the `oio-apex-social-gen` worktree (branch `social-post-generator`).
The generator tool is `video-components/`, run via `npm run storybook` (port 6007). The tool
runs in place — this is a locally-running dev tool, not a deployed service.

## Step 1 — Gather the photos and vehicle

Ian either drops image files into chat or points at a folder/paths. Collect the actual
file paths (from the attachment or `ls` on the folder given).

Figure out which vehicle these are: Ian may say it directly, or you infer it from context
(a prior message, the folder name). If genuinely unclear or the batch looks like it mixes
more than one vehicle, ask — don't guess and stage a batch with the wrong car's name on it.

Look up the vehicle in Brains: `projects/oio-apex/canonical/vehicles/<slug>.md`. If it
exists, that page's `fact`/`name` are the corner-label defaults for this batch. If it
doesn't exist yet, ask Ian for them (year/make/model, nickname) and create the page —
same shape as the existing `betty.md` — so next time you don't have to ask again.

## Step 2 — Look at the photos, narrate the per-photo call

Read each image (you're multimodal — actually look at it, don't guess from the filename).
For each one, decide and say out loud, in one line each:

- **surface** (`dark`/`light`): what's actually behind where the corner label will sit
  (bottom-right corner of the frame). A dark truck bed / shadow / night sky → `dark`. Bright
  sky / concrete / snow → `light`. This is the thing that's genuinely hard to get right from
  a thumbnail-sized mental model — look at the actual bottom-right corner of the actual photo.
- **anchor** (`left`/`right`): default `right` unless the photo's negative space clearly sits
  on the left instead (see the corner-label rule in `HANDOFF.md` — box always sits on the
  outer/negative-space edge).
- Whether this photo is a fit for the post at all (skip anything that's a duplicate, blurry,
  or off-topic — say so rather than silently including it).

Give Ian the summary ("Card 1 — trailer shot, dark bottom-right, boxed right. Card 2 —
garage, light concrete behind, switching to light surface.") and take corrections before
staging. Don't make Ian type anything into a form for this — it happens here, in chat.

## Step 3 — Draft the caption

Read `projects/oio-apex/canonical/caption-voice.md` in Brains (flagged as a draft — still
fine to use, just don't over-index on it as gospel). Write a caption + hashtags matching
the Apex voice: concrete detail first, terse over hypey, no invented details. Say the draft
out loud to Ian as part of the same summary — this is what will show up in the generator's
composer, editable there too.

## Step 4 — Stage the batch

Write a batch JSON (see `video-components/scripts/stage-inbox.mjs` header comment for the
exact shape — batch-level `fact`/`name`/`anchor`/`surface`/`caption`/`hashtags`, plus an
`images[]` array where each entry can override `anchor`/`surface`/`fact`/`name` for that
one photo). Put it somewhere in the scratchpad, then:

```bash
node video-components/scripts/stage-inbox.mjs <path-to-batch.json>
```

This copies the photos into `.social-drafts/inbox/<batch-id>/` and writes `prefill.json`.
The script prints the batch id — you don't need to construct paths yourself.

## Step 5 — Open the tool

Make sure Storybook is running (`curl -s http://localhost:6007/social/accounts` — if that
fails, start it with `cd video-components && npm run storybook` in the background, wait for
"Storybook ready", then retry). Then:

```bash
open "http://localhost:6007/?path=/story/tools-social-post-generator--default"
```

Tell Ian: the batch is staged, the tool is open, load it from the inbox panel, and the only
thing left to do by hand is the crop (drag to pan, slider to zoom, per-photo aspect). The
corner-label fields and caption are pre-filled but still editable in the UI if Ian wants to
tweak something directly instead of asking you to.

## Step 6 — Wait for approval

Ian clicks "Approve" in the tool. You won't get a push notification for this — Ian will
tell you (or you can check `curl -s http://localhost:6007/social/outbox` for a `pending`
manifest with matching content if asked to check).

When Ian says it's approved:
1. Read the newest `.social-drafts/outbox/<id>/manifest.json` and its images.
2. Show Ian the final caption + which accounts it's targeting, as a last confirmation.
3. Ask: **post now, or hold it?**
   - **Now**: call Post-Bridge — `upload_media` for each image (base64 `data` is fine at
     this size), then `create_post` with the returned media ids, `caption` (+ hashtags
     appended), and `social_accounts` (the manifest's account ids). Report back what
     published and where. Edit `manifest.json`'s `status` to `"posted"` (or `"failed"` with
     a note, if it failed) so the tool's outbox list reflects it.
   - **Hold**: leave the manifest as `pending` and don't do anything else — Ian will say
     "post it" later, whenever that is. There's no real scheduling yet (see the Brains page
     above); "hold" just means "wait for the word."

## Hard rule

Never call `create_post` on anything you haven't confirmed with Ian in this same
conversation — a manifest sitting in the outbox is a draft, not a standing instruction to
publish. And never use placeholder/test content when actually calling Post-Bridge — OIO's
real Instagram/Facebook accounts are live on the other end of that call.
