#!/usr/bin/env bash
#
# Re-render the marketing hero's 3D asset.
#
#   ./render.sh [shot] [width] [height]
#
# Renders scene.js in headless Chrome on a transparent background, then crops
# to the figures and writes public/hero/human-ai-operators.webp.
#
# Chrome needs a real origin for ES modules and the import map, so the scene is
# served over HTTP rather than opened from disk. WebGL runs on SwiftShader —
# slower than the GPU path, identical output, and it works on CI.
#
# See docs/engineering/MARKETING_VISUALS.md.
set -euo pipefail

SHOT=${1:-pair}
WIDTH=${2:-1600}
HEIGHT=${3:-1040}
PORT=${PORT:-4599}

HERE="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$(cd "$HERE/../.." && pwd)"
OUT_DIR="$FRONTEND/public/hero"
TMP="$(mktemp -d)"
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}

python3 -m http.server "$PORT" --directory "$HERE" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; rm -rf "$TMP"' EXIT
sleep 1

"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --hide-scrollbars --default-background-color=00000000 \
  --window-size="$WIDTH,$HEIGHT" --virtual-time-budget=35000 \
  --screenshot="$TMP/raw.png" \
  "http://127.0.0.1:$PORT/index.html?shot=$SHOT&w=$WIDTH&h=$HEIGHT" >/dev/null 2>&1

# Crop to the alpha bounding box plus a margin, then encode. The margin is what
# keeps the figures off the frame edge once the HUD sits over them. Run from
# apps/frontend so `sharp` resolves out of that workspace's node_modules.
cd "$FRONTEND"
node -e '
const sharp = require("sharp");
const [input, output] = process.argv.slice(1);
(async () => {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let minX = W, maxX = 0, minY = H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
      }
    }
  }
  const pad = Math.round(W * 0.045);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - 32);
  const width = Math.min(W - left, maxX - left + pad);
  // Stop above the deck: the panel continues the floor in CSS.
  const height = Math.min(H - top, Math.round(H * 0.91) - top);
  await sharp(input)
    .extract({ left, top, width, height })
    .resize({ width: 1360 })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(output);
  const { width: w, height: h } = await sharp(output).metadata();
  console.log(`wrote ${output} (${w}x${h}) — update RENDER in human-ai-calling.tsx if this changed`);
})();
' "$TMP/raw.png" "$OUT_DIR/human-ai-operators.webp"
