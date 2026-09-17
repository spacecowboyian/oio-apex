---
name: oio-post-scheduling
description: >-
  Work out WHEN queued OIO social posts should go out: spaced slots inside a daily
  window (e.g. a random 4–8 hours apart, 08:00–20:00 Chicago). Use it when an agent or
  routine has several posts to queue and they should be spread out, not all go now.
  It only computes times; ingest/rendering is the oio-social-post skill.
user-invocable: false
---

# OIO post scheduling

The timing half of social posting. `oio-social-post` builds and queues the posts. This skill
only answers "at what time should each of these N posts go out?". The caller decides which
policy applies. That decision belongs in the agent's heartbeat or routine instructions, not
in either skill.

## Policies in use

| Source | Policy |
|---|---|
| **OIO Social Posts** album (everyday content) | Spaced: a random **4–8h** apart, only **08:00–20:00 America/Chicago**. |
| **Event galleries** (autocross, rallycross, Lake Garnett…) | **Post now**, as the heartbeat finds each item. No slots needed. |

A new policy goes in this table and in the routine that uses it.

## Computing slots

Never do timezone or daylight-saving maths by hand. Run the helper from the oio-apex root:

```bash
node .claude/skills/oio-post-scheduling/next-slot.mjs --after <ISO> --count <N>
```

- `--after`: the latest `scheduled_at`/`posted_at` in `~/.oio-posted-registry.json` among
  entries for the **same album**. Spacing is per album.
- **Output:** one UTC ISO time per line, in order. Assign them to the items in album order.
- **Defaults** are the everyday policy above. Override them with `--min-gap-h`, `--max-gap-h`,
  `--open`, `--close` and `--tz`.
- **Outside the window:** a slot that falls outside the window rolls to the next opening, plus
  up to 45 minutes of jitter. Slots never land before now + 5 minutes.

**Rescheduling:** to move an already-queued post, compute a fresh slot and
`update_post(scheduled_at=…)`, then update the registry entry.
