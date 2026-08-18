#!/usr/bin/env python3
"""Group face embeddings into people, then build one montage per group.

Greedy agglomeration against running cluster centroids. With a couple of
people in a car and a paddock in the background, the goal is not a perfect
partition -- it is a short list of recurring faces a human can name in one
look. Clusters are ranked by how many distinct seconds they cover, so the
driver and passenger surface above one-off bystanders.
"""
import sys, json
import numpy as np
import cv2
from pathlib import Path

THRESH = 0.42     # cosine; below this a face starts a new cluster


def main(faces, crops_dir, out_dir, top=12):
    rows = [json.loads(l) for l in open(faces)]
    V = np.array([r["vec"] for r in rows], dtype=np.float32)
    order = np.argsort([-r["sharpness"] * r["face_frac"] for r in rows])

    cents, members = [], []
    for i in order:
        v = V[i]
        if cents:
            sims = np.array([float(c @ v) for c in cents])
            j = int(np.argmax(sims))
            if sims[j] >= THRESH:
                members[j].append(i)
                n = len(members[j])
                c = cents[j] * (n - 1) / n + v / n
                cents[j] = c / np.linalg.norm(c)
                continue
        cents.append(v.copy())
        members.append([i])

    for gi, mem in enumerate(members):
        for i in mem:
            rows[i]["cluster"] = gi

    ranked = sorted(range(len(members)),
                    key=lambda g: -len(set(rows[i]["seconds"] for i in members[g])))
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    crops_dir = Path(crops_dir)

    summary = []
    for rank, g in enumerate(ranked[:top]):
        mem = sorted(members[g], key=lambda i: -rows[i]["sharpness"] * rows[i]["face_frac"])
        clips = sorted(set(rows[i]["clip"] for i in mem))
        secs = len(set(rows[i]["seconds"] for i in mem))
        tiles = []
        for i in mem[:12]:
            im = cv2.imread(str(crops_dir / rows[i]["crop"]))
            if im is None:
                continue
            tiles.append(cv2.resize(im, (160, 160)))
        if tiles:
            while len(tiles) < 12:
                tiles.append(np.zeros((160, 160, 3), np.uint8))
            grid = np.vstack([np.hstack(tiles[r * 4:(r + 1) * 4]) for r in range(3)])
            cv2.imwrite(str(out_dir / f"group{rank:02d}.jpg"), grid,
                        [cv2.IMWRITE_JPEG_QUALITY, 88])
        summary.append({"group": rank, "cluster": g, "faces": len(mem),
                        "distinct_seconds": secs, "clips": clips,
                        "samples": [{"clip": rows[i]["clip"], "tc": rows[i]["timecode"]}
                                    for i in mem[:6]]})
        print(f"group{rank:02d}: {len(mem):4d} faces, {secs:4d}s, clips={','.join(clips)}")

    Path(out_dir / "groups.json").write_text(json.dumps(summary, indent=2))
    with open(faces.replace(".jsonl", "-clustered.jsonl"), "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"\n{len(members)} clusters over {len(rows)} faces -> {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
