#!/usr/bin/env python3
"""Orientation-aware face pass over X4 proxy keyframes.

Why this exists: the X4 .lrv proxy is dual-fisheye, and the lens pointed into
the cabin records the interior rotated ~180 degrees. Face detectors are not
rotation invariant, so an upright-only pass silently drops most of the in-car
faces -- measured at 14 vs 38 detections over the same 25 frames. Every face
here is therefore sought at 0 and 180 degrees and the results merged.

Also writes an actual crop per face. Identity on this footage cannot be settled
by a score alone (helmets, visors, fisheye stretch), so the crops are the
evidence a human confirms against.
"""
import sys, json
import cv2
import numpy as np
from pathlib import Path
from multiprocessing import Pool, cpu_count
import facelib

GALLERY = None
CROPS = None


def init(gpath, crops):
    global GALLERY, CROPS
    GALLERY = facelib.load_gallery(gpath) if gpath != "-" else {}
    CROPS = Path(crops)


def iou(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    x0, y0 = max(ax, bx), max(ay, by)
    x1, y1 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    return inter / float(aw * ah + bw * bh - inter)


def one(path):
    img = cv2.imread(path)
    if img is None:
        return []
    p = Path(path)
    sec = int(p.stem.split("_")[1])
    h, w = img.shape[:2]
    found = []
    for rot in (0, 180):
        src = img if rot == 0 else cv2.rotate(img, cv2.ROTATE_180)
        for box, raw, sharp in facelib.faces_in(src):
            # normalize box back to original-frame coords for dedup
            if rot == 0:
                nb = box
            else:
                nb = [w - box[0] - box[2], h - box[1] - box[3], box[2], box[3]]
            if any(iou(nb, f["nb"]) > 0.4 for f in found):
                continue
            found.append({"nb": nb, "box": box, "raw": raw, "sharp": sharp,
                          "rot": rot, "src": src})

    rows = []
    for i, f in enumerate(found):
        v = facelib.embed(f["src"], f["raw"])
        who, score, runner = facelib.match(v, GALLERY) if GALLERY else (None, 0.0, None)
        x, y, fw, fh = f["box"]
        pad = int(0.35 * fh)
        y0, y1 = max(0, y - pad), min(f["src"].shape[0], y + fh + pad)
        x0, x1 = max(0, x - pad), min(f["src"].shape[1], x + fw + pad)
        crop_name = f"{p.parent.name}_{p.stem}_{i}.jpg"
        cv2.imwrite(str(CROPS / crop_name), f["src"][y0:y1, x0:x1],
                    [cv2.IMWRITE_JPEG_QUALITY, 90])
        rows.append({
            "crop": crop_name,
            "still": f"{p.parent.name}/{p.name}",
            "clip": p.parent.name,
            "seconds": sec,
            "timecode": f"{sec // 60}:{sec % 60:02d}",
            "face_box": [int(b) for b in f["nb"]],
            "rot": f["rot"],
            "face_frac": round(fh / h, 3),
            "sharpness": f["sharp"],
            "who": who,
            "score": round(score, 3),
            "runner_up": runner,
            "vec": [round(float(z), 5) for z in v],
        })
    return rows


if __name__ == "__main__":
    root, gpath, out, crops = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]), sys.argv[4]
    Path(crops).mkdir(parents=True, exist_ok=True)
    files = sorted(str(p) for p in root.rglob("*.jpg"))
    print(f"{len(files)} keyframes, {cpu_count()} cores", flush=True)
    keep = []
    with Pool(max(1, cpu_count() - 2), initializer=init, initargs=(gpath, crops)) as pool:
        for i, rows in enumerate(pool.imap_unordered(one, files, chunksize=16)):
            keep += rows
            if i % 500 == 0:
                print(f"  {i}/{len(files)}, {len(keep)} faces", flush=True)
    keep.sort(key=lambda r: (r["clip"], r["seconds"]))
    with out.open("w") as f:
        for r in keep:
            f.write(json.dumps(r) + "\n")
    print(f"\n{len(keep)} faces -> {out}")
