---
name: oio-social-post
description: >-
  Turn OIO vehicle photos into a branded Instagram/Facebook post. USE THIS
  SKILL when Ian invokes it explicitly (`/oio-social-post` or "new social
  post"). In a Claude Code (desktop) session, default to the chat-driven
  headless pipeline — no UI, Claude renders the card and drafts the post
  directly. On mobile (no Code available), hand Ian the standalone artifact
  link instead. Do NOT trigger this automatically just because photos were
  dropped in chat for some other reason — it's explicit-invocation only.
user-invocable: true
argument-hint: "[vehicle name, optional] — then point at a photo file, or just ask for the link"
allowed-tools:
  - Bash(node /private/tmp/**/embed-photos.mjs)
  - Bash(node video-components/scripts/render-social-still.mjs *)
  - Bash(base64 *)
  - Bash(open *)
  - Bash(python3 -m http.server *)
  - Bash(cmp *)
  - Bash(curl * catbox.moe*)
---

# OIO social post skill

Three ways to build a branded OIO social card exist. **In a Claude Code (desktop) session,
default to the chat-driven headless pipeline (below)** — it composites the real photo, drafts
the caption/hashtags from Brains, shows Ian the finished card + copy in chat, and drafts the
post to Post-Bridge directly, no browser step required. **On mobile, hand Ian the artifact
link instead** — the claude.ai mobile app can't run Code or this skill, so the artifact is the
only path there. The Storybook tool (bottom of this file) is legacy/manual-desktop-only; only
use it if Ian explicitly wants hands-on crop control instead of what the pipeline picks.

Full architecture, every bug found and fixed, and the reasoning behind each decision:
`projects/oio-apex/canonical/oio-apex-social-generator.md` in Brains (mirrored to local
memory as `oio-social-post-generator`). **Read it before doing anything else with this
skill** — a lot of hard-won debugging lives there (an MCP server-name resolution bug, a
payload-size timeout fixed by switching to JPEG, an Instagram aspect-ratio crop bug) and
none of it should be re-derived or accidentally re-broken.

## Chat-driven headless pipeline (default for Code sessions)

Built 2026-07-18 after Ian asked to stop using a UI at all when he doesn't have to. Runs
entirely from chat: Claude composites the branded card headlessly (no browser, no Storybook)
and can call Post-Bridge directly — a Code session has first-class MCP tool access to
Post-Bridge, so none of the artifact's `mcp`-capability workaround is needed here.

**Repo**: `oio-apex-social-gen` worktree, branch `social-post-generator`, `video-components/`.

1. **Get the photo as a local file path, not a chat paste.** Confirmed hard limit this
   session: there is no tool in a Code session that can pull a pasted/dropped chat image out
   to a file — the bytes are visible to the model but not reachable by Bash/Read as a path.
   Ask Ian for a path (Downloads, AirDrop'd file, wherever) — a manual paste-and-path-me step
   is the one unavoidable exception to "no UI" here, not a UI *tool*, just a location.
   (A Google Photos shared-album drop-zone was considered as an alternative intake and
   explicitly declined by Ian, 2026-07-18 — don't re-propose it without him raising it again.)
2. Look up the vehicle in Brains (`projects/oio-apex/canonical/vehicles/<slug>.md`) for
   `fact`/`name` defaults; create the page if it doesn't exist. Look at the photo (multimodal
   Read) to pick `anchor`/`surface` and decide crop (`cropX`/`cropY`/`zoom`) and which
   `aspectId` actually fits the photo's native composition — don't default to portrait if the
   source is landscape or square-ish; check the math (see aspects below) before picking.
3. Draft the caption from `projects/oio-apex/canonical/caption-voice.md` and hashtags
   (vehicle/make-model + build/event category + a couple of community tags).
4. Render headlessly:
   ```
   cd video-components
   node scripts/render-social-still.mjs <props.json> <outPath.png>
   ```
   `props.json`: `{ photoPath, fact, name, anchor, surface, cropX, cropY, zoom, aspectId }`.
   `aspectId` is one of `square` | `portrait` (4:5) | `wide` (1.91:1) | `landscape` (4:3,
   general-crop only) | `tall` (3:4, general-crop only) — see `src/social/aspects.ts`. Only
   `square`/`portrait`/`wide` are real Instagram feed ratios; `landscape`/`tall` are for
   non-IG placements (site, Facebook link preview) per the brand guide's "Two groups, two
   purposes" rule — don't post a `landscape`/`tall` render to Instagram.
   All brand sizing (badge, corner-label offsets/font) comes from `tokens.json`'s `social`
   section — that file is the single source of truth; the brand guide HTML mirrors it by hand
   and has drifted out of sync before (badge size, aspect ratio) — if you change tokens.json,
   check `oio-apex-brand-guide.html` section 06 still matches, don't assume it does.
   Corner-label/badge margins are intentionally tight (`badgeOffset`/`cornerLabelOffset`
   `2.22cqw`) — this means a portrait/wide post's badge+label get fully cropped out by
   Instagram's profile-grid square-crop view. A wider-margin fix was built and tested
   2026-07-18, then explicitly reverted by Ian ("too far in") — don't re-attempt without
   asking first; see the `gridCropSafety` note in `tokens.json`.
5. Show Ian the rendered PNG (`SendUserFile`, `display: "render"`) plus the caption/hashtags
   in chat and get a clear go-ahead before doing anything with Post-Bridge.
6. **Getting the render to Post-Bridge**: `upload_media` needs either a public URL (their
   server fetches it) or raw bytes as base64 text in the tool call. Local file paths are
   useless here — Post-Bridge's API runs on a remote server with no access to Ian's
   filesystem, regardless of what access Claude has to it. Base64-in-context was tested and
   is not viable at real photo quality (a single ~150KB JPEG is ~200k+ tokens as base64 text).
   So: upload the render to a public URL first —
   ```
   curl -sS -F "file=@<path>" https://catbox.moe/user/api.php
   ```
   returns a direct `https://files.catbox.moe/xxxxx.png` URL. Confirmed working 2026-07-18
   (0x0.st has disabled uploads; transfer.sh is unreachable — catbox.moe is the current
   working option, re-check if it ever stops working). Ian was offered a more-private
   alternative (he grabs a real Dropbox/Google Photos share link himself and hands it over)
   and chose to stick with catbox as good-enough, since the card is headed to public
   Instagram/Facebook anyway — don't re-relitigate this choice, just use catbox by default.
   Pass that URL straight to `upload_media`'s `url` param, then `create_post` with the
   returned `media_id`.
7. **Always stage with `is_draft: true` unless Ian explicitly says publish/post now.** Relay
   the exact caveat `create_post` returns: `is_draft` only holds the post inside Post-Bridge,
   it is **not** a draft on Instagram/Facebook themselves — sending it later publishes to
   every selected account immediately, no per-platform review step. Say this plainly every
   time, don't assume Ian remembers it from a prior session.
8. Default accounts: oioracing Instagram (id `50547`) + "Outside Inside Outside Racing"
   Facebook (id `50528`) — confirm via `list_social_accounts` if unsure, IDs can drift.

## The artifact

Published at **https://claude.ai/code/artifact/76e6fb79-b4bc-435c-aa16-5c7a726a5692** — same
URL persists across redeploys from this conversation history. It's a standalone HTML/canvas
tool with no server, no build step, no dependency on this repo being checked out or
Storybook running. It:

**Known drift as of 2026-07-18**: this artifact has its own hardcoded copy of the brand math
(badge at 13.35cqw) that's out of sync with `tokens.json` (now 8.9cqw after a later halving),
has no embedded-Helvetica-Neue fix, and doesn't have the square/1.91:1 aspect support the
headless pipeline gained the same day. It still works and is what Ian uses from mobile — just
don't assume it's pixel-identical to what the chat pipeline produces until someone resyncs it.

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

**Update 2026-07-18**: the old "portrait was 1080x1440 (3:4) instead of the IG-safe 1080x1350
(4:5)" bug is fixed — `video-components/src/social/aspects.ts` is shared code between this
Storybook tool and the headless pipeline above, so fixing it for one fixed it for both. That
file now also has `square` and `wide` (1.91:1) aspect options and a `category` field
(`instagram` vs `generalCrop`) that `stage-inbox.mjs`/`SocialPostGenerator.tsx` may not
surface in the UI yet — check before assuming the picker exposes every ratio.
