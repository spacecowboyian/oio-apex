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
  - Bash(node packages/social-card/src/cli.mjs *)
  - Bash(node packages/video/scripts/render-social-still.mjs *)
  - Bash(npm run social*)
  - Bash(base64 *)
  - Bash(open *)
  - Bash(python3 -m http.server *)
  - Bash(cmp *)
  - Bash(curl * tmpfiles.org*)
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
memory as `oio-social-post-generator`). The happy path below is self-contained — you do NOT
need to read that whole doc every time (it's long, and reading it every session is pure token
cost). **Read it only when something breaks or is ambiguous** — it holds hard-won debugging
(MCP server-name resolution, a JPEG payload-size fix, the Instagram aspect-ratio crop bug,
the dead-host history) that shouldn't be re-derived or re-broken.

**Repo layout (monorepo, 2026-07-19).** This is an npm-workspaces monorepo:
- `packages/tokens/` — `@oio/tokens`, the single source of brand truth (`tokens.json` +
  licensed Helvetica Neue faces). Both packages below read from here; nothing re-derives a
  brand value.
- `packages/social-card/` — `@oio/social-card`, the **Chrome-free** still renderer
  (`@napi-rs/canvas`). This is the default for posting: no npm-install-of-Remotion, no Chrome
  download, ~250ms/card. It's a verified pixel-faithful match to the Remotion render.
  Props now include `rotate` (degrees) alongside `cropX`/`cropY`/`zoom`.

**Surface-aware bottom scrim (2026-07-19, Ian's call).** The bottom gradient is no longer
always-dark. `surface: "dark"` (white label) → dark scrim, as before, to pop the white label.
`surface: "light"` (black label) → **no scrim by default** — a light-surface card was chosen
because the photo bottom is already light, and a dark scrim there just muddies the black label
(it "gets lost"). Optional `vignette` prop overrides per-card: `"dark"` | `"light"` (a white
scrim, for a light-surface photo whose bottom is uneven and needs a guaranteed backdrop) |
`"none"` | `"auto"` (the default surface-derived behavior).

**OIO badge placement (2026-07-20, Ian's call).** The badge now defaults to **bottom-left**
(normal size), not top-left — the top-left mark echoed/clashed with the platform's own OIO
avatar right above the post. In bottom-left mode the badge is contrast-matched like the label
box (white disc on dark cards, black on light) and the corner-label text is aligned straight
across to the badge's OIO glyph line. Optional `badge` prop overrides: `"bottom-left"`
(default) | `"top"` (legacy) | `"none"` (no badge — rely on the avatar) | `"corner"` (fold a
small OIO disc into the corner-label lockup) | `"auto"`.

**Interactive crop tool (for when Ian wants to frame it himself).** A published Artifact —
**https://claude.ai/code/artifact/e6a760f7-28c5-4540-94c6-384a8b782fd3** — lets Ian
pan/zoom/**rotate**/aspect a photo over the live branded card in his browser (desktop + phone;
built 2026-07-19). It shares the *exact* `card-draw.mjs` code with the headless renderer
(inlined by `npm run -w @oio/social-card build-crop-tool` from `crop-tool/template.html`), so
what he sees is what posts — no drift. **Hand-back-to-chat flow** (Ian's choice, not
direct-publish): he frames it, hits **Download card** (or **Copy settings** → the props JSON),
and gives you the file/settings; you then host + schedule/post with the normal confirm gate.
The tool has no connector access — it only produces the card. Rebuild + republish after any
`card-draw.mjs`/`tokens.json` change: `npm run -w @oio/social-card build-crop-tool`, then
`Artifact` with the same URL. Source is committed; the built HTML is gitignored (regenerable).
- `packages/video/` — `@oio/video`, the Remotion project (video work + the headless
  still-render **reference** at `scripts/render-social-still.mjs`). Only reach for the Remotion
  still-render if you specifically need to re-validate fidelity; it's slow (Chrome download).

**Don't run `/impeccable` per post.** The card comes out of locked, already-impeccable'd
components fed by `tokens.json` — a photo through a locked template is not new component work.
A per-post full critique is a large token cost for ~zero value. Do a lightweight inline
brand-compliance glance instead (contrast of the label/badge zones against the real photo
pixels, anchor, aspect-math, crop). Reserve `/impeccable` for when the *components or tokens*
actually change.

## Chat-driven headless pipeline (default for Code sessions)

Built 2026-07-18 after Ian asked to stop using a UI at all when he doesn't have to. Runs
entirely from chat: Claude composites the branded card headlessly (no browser, no Storybook)
and can call Post-Bridge directly — a Code session has first-class MCP tool access to
Post-Bridge, so none of the artifact's `mcp`-capability workaround is needed here.

**Repo**: monorepo `packages/` (see layout above). Run commands from the repo root.

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
4. Render (Chrome-free, default). From the repo root:
   ```
   node packages/social-card/src/cli.mjs render <props.json> <outPath.png|.jpg>
   ```
   ~250ms, no Chrome, no Remotion. For the Upload-Post path render JPEG (`<out>.jpg`,
   `--jpeg-quality 0.85`) — smaller payload, faster host, no visible quality loss at 1080px.
   `props.json`: `{ photoPath, fact, name, anchor, surface, cropX, cropY, zoom, aspectId }`
   (identical shape to the legacy Remotion `render-social-still.mjs`, so props swap 1:1).
   The Remotion equivalent (`packages/video/scripts/render-social-still.mjs`) is the fidelity
   *reference* only — slow (downloads Chrome), use it just to re-validate the canvas renderer.
   `aspectId` is one of `square` | `portrait` (4:5) | `wide` (1.91:1) | `landscape` (4:3,
   general-crop only) | `tall` (3:4, general-crop only) — see `packages/social-card/src/aspects.mjs`. Only
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
6. **Publish (default: Upload-Post, chosen by Ian 2026-07-19).** Upload-Post's `upload_photos`
   needs a **public URL** — it has no base64/inline path for photos (unlike `upload_video`'s
   `videoBase64`), and a local sandbox path fails with "Photo file not found" (its server can't
   see the filesystem). So host the JPEG first with the baked-in helper (do NOT hand-derive
   this — catbox.moe is dead, 412 "Invalid uploader"; 0x0.st disabled uploads):
   ```
   node packages/social-card/src/cli.mjs upload <outPath.jpg>
   ```
   It uploads to tmpfiles.org and prints the **direct** `https://tmpfiles.org/dl/<ts>.<hash>/...`
   URL (the naive URL tmpfiles returns serves an HTML preview page, not the file — the helper
   extracts the real one and verifies `content-type: image/*`). Pass that URL to
   `upload_photos`'s `photosPathsOrUrls`, with `user: "oioracing"`, `platforms: ["instagram"]`,
   `title` + `description` (caption + hashtags), `asyncUpload: true`. Then poll `get_status`
   until `status: "completed"` and the platform result shows `success: true` with a real
   `post_url` — never trust the immediate `processing`.
   **No draft step:** Upload-Post publishes live (or scheduled) — there is no `is_draft`
   equivalent. So get Ian's explicit go-ahead BEFORE the `upload_photos` call, not after.
7. **Alternative publish path: Post-Bridge** (if Ian asks for it). Post-Bridge's `upload_media`
   accepts base64 `data` up to 3MB — our card is ~1.5MB base64, so it fits with **no public
   host at all**: `upload_media(data=<base64>, mime_type="image/jpeg")` -> `media_id` ->
   `create_post`. It also has a real `is_draft` hold. Strictly less fragile than the URL path;
   offer it if the host ever flakes. **Always stage `is_draft: true` unless Ian says post now**,
   and relay that `is_draft` only holds it inside Post-Bridge — sending later publishes to every
   selected account immediately, no per-platform review.
8. Default accounts — Upload-Post: profile `oioracing`, Instagram connected
   (`list_users`). Post-Bridge: oioracing Instagram (id `50547`) + "Outside Inside Outside
   Racing" Facebook (id `50528`) — confirm via `list_social_accounts`/`list_users`, IDs drift.

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
