# id-catalog

Face recognition for OIO video ingest — matches faces in extracted keyframes
against an enrolled gallery of OIO drivers, so ingest can name/tag clips by
who's in them instead of a human tagging every file.

Python, not part of the npm workspace. `packages/event-kit` shells out to
these scripts during ingest.

## Setup

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
scripts/fetch-models.sh   # pulls models/sface.onnx (37MB, gitignored)
```

`models/yunet.onnx` (232KB) is committed directly.

## Pipeline

1. **`src/enroll.py <out.npz> <ref_dir> [ref_dir2 ...]`** — build a gallery
   from `gallery/refs/<person>_<anything>.jpg`. One embedding per image (the
   largest face in it). Run after adding/replacing a reference photo:
   ```bash
   .venv/bin/python3 src/enroll.py gallery/gallery.npz gallery/refs
   ```
2. **`src/identify.py <keyframe_dir> <gallery.npz|-> <out.jsonl> <crops_dir>`**
   — detects faces in every keyframe (at 0° and 180°, merged — see facelib.py
   docstring for why), embeds, matches against the gallery, writes one row per
   face plus a crop image for human review.
3. **`src/cluster.py <faces.jsonl> <crops_dir> <out_dir>`** — when the gallery
   is thin, groups unmatched faces into "who is this" clusters with a montage
   per cluster, ranked by how many distinct seconds they cover, so a human can
   name a cluster once instead of eyeballing every crop.

## Gallery state

`gallery/refs/` holds the source photos, `gallery/gallery.npz` is the built
embeddings (regenerate after touching refs — never hand-edit the `.npz`).

Current roster coverage (2026-08-18): hudson=2, ian=1, keegan=1, miles=1,
ryan=2. **Doug is not enrolled — no reference photo exists yet.** Every other
OIO member/car-owner in `projects/oio/canonical/oio-team-bios.md` (Brains)
should eventually get a `gallery/refs/<person>_a.jpg` too; add photos and
re-run `enroll.py`.

A gallery with missing people lies confidently — an unenrolled face still
scores against whoever IS in the gallery and can land a wrong match. Cluster
first on new footage, have Ian name the clusters, then enroll — never file a
driver folder off an unconfirmed gallery hit.

## Known constraints

- **X4 `.lrv` proxy is dual-fisheye**; the cabin-facing lens is upside down.
  Detection always runs at 0° and 180° and merges — an upright-only pass
  drops most in-car faces (measured 14 vs 38 detections over the same 25
  frames).
- Cosine similarity on SFace: 0.363 is the model's own "same person"
  threshold; this pipeline holds a higher bar (0.45, with a 0.06 margin over
  the runner-up) before auto-assigning an identity — a wrong driver label
  silently poisons the folder structure downstream, and an "unknown" is cheap
  to resolve by asking.
