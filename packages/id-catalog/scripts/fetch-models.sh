#!/usr/bin/env bash
# Fetches sface.onnx (37MB, too large to commit raw) from the opencv_zoo
# release. The `raw.githubusercontent.com` URL returns a git-LFS text
# pointer, not the file -- use media.githubusercontent.com instead.
set -euo pipefail
cd "$(dirname "$0")/.."
curl -L -o models/sface.onnx \
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
echo "-> models/sface.onnx"
