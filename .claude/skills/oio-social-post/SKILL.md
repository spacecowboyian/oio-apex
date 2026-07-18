---
name: oio-social-post
description: >-
  Turn OIO vehicle photos into a branded Instagram/Facebook post via the
  standalone Social Post Maker artifact. USE THIS SKILL when Ian invokes it
  explicitly (`/oio-social-post` or "new social post") — either to hand him
  the artifact link, or to preload photos he just dropped in chat into it.
  Do NOT trigger this automatically just because photos were dropped in
  chat for some other reason — it's explicit-invocation only.
user-invocable: true
argument-hint: "[vehicle name, optional] — then drop or point at photos, or just ask for the link"
allowed-tools:
  - Bash(node /private/tmp/**/embed-photos.mjs)
  - Bash(base64 *)
  - Bash(open *)
  - Bash(python3 -m http.server *)
  - Bash(cmp *)
---

# OIO social post skill

Two ways to build a branded OIO social card exist. **Default to the artifact — it's the
current, maintained path and the only one that works on mobile.** The Storybook tool
(bottom of this file) is legacy/desktop-only; only use it if Ian explicitly asks for it.

Full architecture, every bug found and fixed, and the reasoning behind each decision:
`projects/oio-apex/canonical/oio-apex-social-generator.md` in Brains (mirrored to local
memory as `oio-social-post-generator`). **Read it before doing anything else with this
skill** — a lot of hard-won debugging lives there (an MCP server-name resolution bug, a
payload-size timeout fixed by switching to JPEG, an Instagram aspect-ratio crop bug) and
none of it should be re-derived or accidentally re-broken.

## The artifact

Published at **https://claude.ai/code/artifact/76e6fb79-b4bc-435c-aa16-5c7a726a5692** — same
URL persists across redeploys from this conversation history. It's a standalone HTML/canvas
tool with no server, no build step, no dependency on this repo being checked out or
Storybook running. It:

- Lets Ian pick photos directly from his camera roll (or drag-drop on desktop) — no chat
  round-trip needed.
- Lays every photo out on the page at once (not a tab switcher) with its own crop/zoom/aspect.
- Uses ONE shared fact/name/anchor/surface/caption for the whole post (not per-photo — Ian
  asked for this explicitly after using the per-photo version).
- Publishes directly to Post-Bridge via the `mcp` runtime capability when Publish is clicked
  — no hand-off through chat. Polls `get_post`/`list_post_results` until each platform
  confirms `posted`/`failed` with a real URL; never trusts the immediate `processing` status.

**Works identically on mobile.** The claude.ai mobile app doesn't run Claude Code or skills
— but it doesn't need to. Ian just opens the artifact URL directly in the app (bookmark it,
or find it via the app's Artifacts list) and uses it standalone: camera roll picker, crop,
caption, Publish, all using the mobile app's own Post-Bridge connector session. This skill
only matters for *desktop Claude Code* sessions — it exists so a fresh session knows the
artifact already exists and doesn't rebuild it from scratch.

### When Ian just wants the link

Give him **https://claude.ai/code/artifact/76e6fb79-b4bc-435c-aa16-5c7a726a5692** — nothing
else to do. He can use it fully standalone, including publishing, on any device.

### When Ian drops photos in this chat and wants them preloaded

He can always use the artifact's own picker instead, but if he's dropped photos in-chat and
it's more convenient for you to preload them:

1. Look up the vehicle in Brains (`projects/oio-apex/canonical/vehicles/<slug>.md`) for the
   `fact`/`name` defaults, same as before. Create the page if it doesn't exist yet.
2. Look at each photo (multimodal) and decide `anchor`/`surface` — these are now SHARED
   across the whole batch (not per-photo), so pick the call that fits the batch overall and
   say so out loud. Draft a caption from `projects/oio-apex/canonical/caption-voice.md`.
3. Get the artifact's current HTML source (Read it if you don't have it in context, or ask —
   it lives only as a published artifact, not a file in this repo).
4. **Critical: never let base64 photo data pass through your own model context.** Write a
   Node script (the `embed-photos.mjs` pattern — read it from a recent session transcript
   or reconstruct from the Brains page) that:
   - reads each photo file and base64-encodes it via `base64 -b 0 -i <file> -o <tmp>.b64`
     (macOS syntax — `-b 0` means no line wrapping, avoids a real corruption bug from an
     earlier session)
   - reads the artifact's HTML template
   - splices an `EMBEDDED_SHARED` (fact/name/anchor/surface/caption/hashtags) and
     `EMBEDDED_PHOTOS` (fileName/dataUrl) block into it, entirely within the script
   - writes the result back out
5. **Verify byte-integrity before publishing**: decode the embedded base64 back to a file
   and `cmp` it against the source photo. If they don't match, something corrupted — do not
   proceed.
6. Publish via the `Artifact` tool with the same file path (keeps the URL stable). Omit
   `capabilities` on redeploy — it carries the prior `mcp` declaration forward automatically.
7. Tell Ian to open/reload the artifact — his photos, vehicle info, and caption are already
   loaded, he just needs to check crop and hit Publish himself.

### If Publish fails

The artifact's own diagnostic banner shows the exact error code and message — that's the
first thing to look at, not a guess. Two categories worth knowing before Ian even asks:

- **`server_unavailable`/`upstream_error`**: transient. Before telling Ian to retry, check
  directly whether anything actually went through — `list_posts`/`list_media` via your own
  Post-Bridge MCP connection, looking for a new post/media matching this batch's caption or
  filename. A rejected write is an ambiguous outcome (the runtime's own contract says so) —
  never assume a retry is safe without checking first, since a retry after a partial success
  could double-post to OIO's real accounts.
- **`not_in_manifest`**: if this recurs after a hard reload, it's a deeper bug (was fixed
  once already — see the Brains history) — don't just tell Ian to reload again, read the
  history first.

## Hard rule

Never call `create_post` (or tell Ian it's safe to retry Publish) without being sure — via a
direct Post-Bridge check, not a guess — about what state the last attempt left things in.
OIO's real Instagram/Facebook accounts are live on the other end of every one of these calls.

---

## Legacy: the Storybook tool (desktop-only, this worktree only)

Only use this if Ian explicitly asks for it over the artifact. Repo: `oio-apex-social-gen`
worktree (branch `social-post-generator`). Generator tool is `video-components/`, run via
`npm run storybook` — **must bind port 6007 explicitly**: `npm run storybook` defaults to
6006 and prompts interactively on conflict, which hangs a non-interactive shell. Use
`npx storybook dev -p 6007 --ci` instead.

1. Gather photos + vehicle, same lookup/creation flow as above.
2. Look at each photo, decide per-photo `anchor`/`surface` (this tool DOES support per-photo
   overrides via `stage-inbox.mjs`'s `images[]` array, unlike the artifact).
3. Draft caption from the same Brains page.
4. Write a batch JSON (see `video-components/scripts/stage-inbox.mjs` header comment for the
   shape) and run `node video-components/scripts/stage-inbox.mjs <path>`.
5. Confirm Storybook is up (`curl -s http://localhost:6007/social/accounts`), then
   `open "http://localhost:6007/?path=/story/tools-social-post-generator--default"`.
6. Ian does the crop by hand in the browser, clicks **Approve**.
7. Read the newest `.social-drafts/outbox/<id>/manifest.json`, confirm caption + accounts
   with Ian, ask **post now or hold?** — same publish/poll discipline as the artifact.

**Known unfixed bug in this tool as of 2026-07-18**: portrait export is 1080x1440 (3:4),
but Instagram's real max portrait ratio is 4:5 (1080x1350) — IG crops 3:4 uploads, cutting
off the badge and corner label. Already fixed in the artifact; not yet fixed here
(`video-components/src/social/aspects.ts` + `tokens.json`/brand guide section 06).
