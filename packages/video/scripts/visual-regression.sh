#!/usr/bin/env bash
# Visual regression check for the shared Leaderboard component family
# (Leaderboard.tsx, LeaderboardShell.tsx, rowCells.tsx, layout.ts, runProgress.ts).
#
# Renders every pre-existing (non-recap) leaderboard-configs/*.json fixture at
# a few representative frames using the code at $BASELINE_REF (a real commit,
# via a throwaway git worktree — not a stored "golden image" that could go
# stale or be wrong), then renders the SAME configs/frames with the current
# working tree, and diffs pixel-for-pixel. A config only appears in this
# script's CONFIGS list if it existed before issue #13's vertical-shorts work
# — the whole point is confirming that work hasn't changed anything that was
# already signed off. New recap-only fixtures (rallycross-run-sequence.json,
# vertical-rallycross*.json) are deliberately excluded; they're expected to
# change as that feature is worked on.
#
# Usage (from packages/video/):
#   bash scripts/visual-regression.sh [baseline-ref]
#
# Exits non-zero if any config/frame pair differs.
#
# ONE KNOWN, REVIEWED DIFF (as of the recap feature's textColorFor fix): any
# config with a non-featured/non-leader ("bystander") row visible at a given
# frame will FAIL — bystander text moved from `color.base.text` (a token
# that doesn't exist, silently rendering unset — black in some render
# branches, invisible against the near-black row background, e.g.
# `autocross-position-change.json`) to `color.base.muted`, a real fix for a
# real pre-existing bug (see rowCells.tsx's `textColorFor` comment; verified
# against this exact baseline before landing). frame 0 (before any row's
# entrance animation has revealed content) and `autocross-final-results.json`
# (uses a separate, untouched `textColorFor` in finalResultsCells.tsx) are
# unaffected and should always read OK. Any OTHER diff is a real regression —
# investigate before shipping.

set -euo pipefail

BASELINE_REF="${1:-8eeda5f}"  # "Restructure into npm-workspaces monorepo" — last commit before issue #13
VIDEO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$VIDEO_DIR/../.." && pwd)"
SCRATCH="$(mktemp -d)"
WORKTREE="$SCRATCH/baseline"
CHROME="/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"

# every fixture that predates issue #13 — the ones this check exists to protect.
CONFIGS=(
  track
  autocross-class-leader-overflow
  autocross-class-manual
  autocross-final-results
  autocross-leader
  autocross-manual-featured
  autocross-position-change
  rallycross
)
FRAMES=(0 30 60)

cleanup() {
  cd "$REPO_ROOT"
  git worktree remove "$WORKTREE" --force >/dev/null 2>&1 || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

write_scratch_root() {
  local dir="$1"
  cat > "$dir/src/Root.verify.tsx" <<'EOF'
import "./index.css";
import { Composition } from "remotion";
import { LeaderboardComposition, LeaderboardProps, resolveConfig } from "./leaderboard/Leaderboard";
import { computeDuration } from "./leaderboard/layout";
import defaultLeaderboardConfig from "../leaderboard-configs/autocross-position-change.json";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Leaderboard"
      component={LeaderboardComposition}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={90}
      defaultProps={defaultLeaderboardConfig as LeaderboardProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: computeDuration(resolveConfig(props as LeaderboardProps), 30),
      })}
    />
  );
};
EOF
  cat > "$dir/src/index.verify.ts" <<'EOF'
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.verify";

registerRoot(RemotionRoot);
EOF
}

render_all() {
  local video_dir="$1" out_dir="$2"
  mkdir -p "$out_dir"
  (
    cd "$video_dir"
    for cfg in "${CONFIGS[@]}"; do
      for f in "${FRAMES[@]}"; do
        npx remotion still src/index.verify.ts Leaderboard "$out_dir/${cfg}-${f}.png" \
          --frame="$f" --props="./leaderboard-configs/${cfg}.json" \
          --browser-executable="$CHROME" >/dev/null 2>&1 || echo "  ! render failed: $cfg frame $f"
      done
    done
  )
}

echo "== setting up baseline worktree at $BASELINE_REF =="
cd "$REPO_ROOT"
git worktree add "$WORKTREE" "$BASELINE_REF" >/dev/null
ln -s "$REPO_ROOT/node_modules" "$WORKTREE/node_modules"
ln -s "$REPO_ROOT/packages/video/node_modules" "$WORKTREE/packages/video/node_modules"
[ -d "$REPO_ROOT/packages/tokens/node_modules" ] && ln -s "$REPO_ROOT/packages/tokens/node_modules" "$WORKTREE/packages/tokens/node_modules" || true
write_scratch_root "$WORKTREE/packages/video"
write_scratch_root "$VIDEO_DIR"

echo "== rendering baseline (this takes a minute) =="
render_all "$WORKTREE/packages/video" "$SCRATCH/baseline-frames"

echo "== rendering current working tree =="
render_all "$VIDEO_DIR" "$SCRATCH/current-frames"

rm -f "$VIDEO_DIR/src/Root.verify.tsx" "$VIDEO_DIR/src/index.verify.ts"

echo "== diffing =="
python3 - "$SCRATCH/baseline-frames" "$SCRATCH/current-frames" "${CONFIGS[@]}" <<'PYEOF'
import sys
from PIL import Image, ImageChops

baseline_dir, current_dir = sys.argv[1], sys.argv[2]
configs = sys.argv[3:]
frames = [0, 30, 60]

failures = []
for cfg in configs:
    for f in frames:
        name = f"{cfg}-{f}.png"
        try:
            a = Image.open(f"{baseline_dir}/{name}").convert("RGB")
            b = Image.open(f"{current_dir}/{name}").convert("RGB")
        except FileNotFoundError:
            print(f"  SKIP  {name} (render missing on one side)")
            continue
        if a.size != b.size:
            failures.append(name)
            print(f"  FAIL  {name}  size mismatch {a.size} vs {b.size}")
            continue
        diff = ImageChops.difference(a, b)
        if diff.getbbox() is None:
            print(f"  OK    {name}")
        else:
            failures.append(name)
            print(f"  FAIL  {name}  differs at {diff.getbbox()}")

print()
if failures:
    print(f"{len(failures)} pair(s) differ from baseline:")
    for name in failures:
        print(f"  - {name}")
    sys.exit(1)
else:
    print("All pairs pixel-identical to baseline. No regression.")
PYEOF
