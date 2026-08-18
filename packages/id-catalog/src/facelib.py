#!/usr/bin/env python3
"""Face detection + identity embeddings.

Extends the morning's Haar-cascade miner, which could only answer "is there a
face here?" — every row it wrote carries who=null because a cascade has no
notion of identity. This adds the missing half: YuNet for detection (better on
the wide, low-contrast, helmet-shadowed frames that in-car footage produces)
and SFace for a 128-d embedding, so a face can be matched against an enrolled
gallery instead of only counted.

Cosine similarity on SFace: >=0.363 is the model's own "same person" threshold.
We hold a higher bar by default because a wrong driver label silently poisons
the folder structure downstream, and an unknown is cheap to resolve by asking.
"""
import cv2
import numpy as np
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parent.parent
YUNET = PKG_ROOT / "models" / "yunet.onnx"
SFACE = PKG_ROOT / "models" / "sface.onnx"

SAME_PERSON = 0.363   # SFace reference threshold
CONFIDENT = 0.45      # our bar for auto-assigning an identity
MARGIN = 0.06         # winner must beat runner-up by this much

_det = None
_rec = None


def detector(w, h, score=0.6):
    global _det
    if _det is None:
        _det = cv2.FaceDetectorYN.create(str(YUNET), "", (w, h), score, 0.3, 5000)
    _det.setInputSize((w, h))
    return _det


def recognizer():
    global _rec
    if _rec is None:
        _rec = cv2.FaceRecognizerSF.create(str(SFACE), "")
    return _rec


def sharpness(gray):
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def faces_in(img, min_frac=0.02, min_sharp=25.0):
    """Detect faces and return [(box, landmarks_row, sharpness)] worth embedding.

    min_frac is far lower than the cascade pass used (0.055): on an equirect
    360 frame a driver's head is a small slice of a 2:1 panorama even when they
    fill the actual lens, so the cascade's framing assumption throws away the
    exact frames we want.
    """
    h, w = img.shape[:2]
    det = detector(w, h)
    ok, res = det.detect(img)
    if not ok or res is None:
        return []
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    out = []
    for row in res:
        x, y, fw, fh = [int(v) for v in row[:4]]
        if fh / h < min_frac or fw < 12 or fh < 12:
            continue
        x0, y0 = max(0, x), max(0, y)
        crop = gray[y0:y0 + fh, x0:x0 + fw]
        if crop.size == 0:
            continue
        sh = sharpness(crop)
        if sh < min_sharp:
            continue
        out.append(([x, y, fw, fh], row, round(float(sh), 1)))
    return out


def embed(img, row):
    """128-d L2-normalized identity vector for one detected face."""
    rec = recognizer()
    aligned = rec.alignCrop(img, row)
    feat = rec.feature(aligned)
    v = np.asarray(feat).ravel().astype(np.float32)
    n = np.linalg.norm(v)
    return v / n if n else v


def match(vec, gallery):
    """Nearest identity in the gallery.

    gallery: {name: np.ndarray (n_refs, 128)}. Returns (who, score, runner_up).
    who is None when nothing clears CONFIDENT or the top two are too close to
    separate — an honest abstention, not a coin flip.
    """
    scored = []
    for name, refs in gallery.items():
        scored.append((name, float(np.max(refs @ vec))))
    if not scored:
        return None, 0.0, None
    scored.sort(key=lambda t: -t[1])
    top, second = scored[0], (scored[1] if len(scored) > 1 else (None, 0.0))
    if top[1] < CONFIDENT or (second[0] and top[1] - second[1] < MARGIN):
        return None, top[1], top[0]
    return top[0], top[1], second[0]


def load_gallery(path):
    data = np.load(path, allow_pickle=True)
    return {k: np.asarray(v, dtype=np.float32) for k, v in data.items()}
