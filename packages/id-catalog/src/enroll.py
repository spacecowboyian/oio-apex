#!/usr/bin/env python3
"""Build an identity gallery from labeled reference stills.

Input is a directory of images named <person>_<anything>.jpg (the convention
the morning pass already used in drv/). Each image contributes one embedding,
the largest face in it — reference crops are framed on their subject, so
"largest" is the intended one.

Writes gallery.npz: {person: (n_refs, 128) float32}. More refs per person is
strictly better; matching takes the max over refs, so a bare-headed shot and a
helmeted shot can both vote for the same name.
"""
import sys
import cv2
import numpy as np
from pathlib import Path
from collections import defaultdict
import facelib


def main(src_dirs, out):
    g = defaultdict(list)
    skipped = []
    for d in src_dirs:
        for p in sorted(Path(d).glob("*.jpg")):
            name = p.stem.split("_")[0].lower()
            img = cv2.imread(str(p))
            if img is None:
                skipped.append((p.name, "unreadable"))
                continue
            found = facelib.faces_in(img, min_frac=0.02, min_sharp=0.0)
            if not found:
                skipped.append((p.name, "no face detected"))
                continue
            _, row, _ = max(found, key=lambda t: t[0][2] * t[0][3])
            g[name].append(facelib.embed(img, row))
            print(f"  + {name:8s} <- {p.name}")

    if not g:
        print("no references enrolled")
        return 1
    np.savez(out, **{k: np.stack(v) for k, v in g.items()})
    print(f"\ngallery: " + ", ".join(f"{k}={len(v)}" for k, v in sorted(g.items())))
    for n, why in skipped:
        print(f"  skipped {n}: {why}")
    print(f"-> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[2:], sys.argv[1]))
