# Marketing visuals

How the marketing site's non-screenshot imagery is produced. Right now that is
one asset — the 3D hero render — but the rules below apply to any future one.

## The hero render

`apps/frontend/public/hero/human-ai-operators.webp` is the image at the centre
of the home hero and the AI voice-agent hero: a Ringee teammate on a headset
standing next to a Ringee AI voice agent, both lit as a single scene.

It is not stock art and not a screenshot. The scene is built in three.js from
primitives and checked in at `apps/frontend/scripts/hero-3d/scene.js`, so the
picture is source, not a binary someone once exported and nobody can change.

### Why it is pre-rendered

The obvious alternative is a live `<canvas>` in the hero. We do not do that:

- The hero is a server component with no client JavaScript. A WebGL canvas
  would pull three.js (~600 KB), a client boundary and a render loop into the
  first screen of the marketing site, for a scene that never changes.
- The composition is fixed. Nothing in it responds to input, so an interactive
  renderer buys nothing a still frame does not already give.
- A 1360 px WebP of the whole scene is ~80 KB, which is smaller than the
  library alone.

Movement that the visual does need — the float, the studio glow, the live
waveforms, the pointer parallax — is CSS in the `ringee-stage` block of
`globals.css`, over the still.

### Re-rendering it

```bash
apps/frontend/scripts/hero-3d/render.sh            # the pair, as shipped
apps/frontend/scripts/hero-3d/render.sh human      # one figure, for a new crop
apps/frontend/scripts/hero-3d/render.sh robot
```

The script serves the scene over HTTP (ES modules and the import map need a
real origin), screenshots it in headless Chrome on a transparent background,
crops to the figures, and writes the WebP. WebGL runs on SwiftShader, so it
works headless and on CI; it is slower than the GPU path and pixel-identical.

`CHROME=/path/to/chrome` overrides the browser, `PORT` the local port. The
script prints the size it wrote — **copy it into the `RENDER` constant in
`human-ai-calling.tsx`**, because `next/image` needs the intrinsic dimensions
and a stale pair stretches the figures.

### Conventions that keep the render usable

- **Transparent background.** The stage, the glow and the floor fade are the
  panel's job, in CSS. Bake none of them into the image, or the asset stops
  working the moment the panel's palette changes.
- **Crop above the deck.** The figures are cut mid-thigh and the panel
  continues the floor with a gradient. This is what lets the same asset sit in
  a short hero column and a tall one.
- **Label in markup, never in pixels.** Every word over the render — the roles,
  the channels, the call status — is HTML. It stays legible when the image is
  scaled, and it stays translatable and indexable.
- **Pin the three.js version** in `index.html`. A minor bump changes tone
  mapping and shadow output, which silently re-lights the scene.
- **Keep both figures in one scene.** Separate renders drift apart in lighting
  and scale, and the whole point of the picture is that the two operators
  belong to the same stack.

### Gotchas found the hard way

- `CanvasTexture` uploads as fully transparent in this headless renderer.
  Contact shadows are a `ShaderMaterial` with a radial falloff instead.
- `smoothstep(1.0, 0.0, x)` is undefined in GLSL — reversed edges silently
  return 0 on this driver. Write `1.0 - smoothstep(0.0, 1.0, x)`.
- A deck with high `metalness` takes its colour from the environment map, so
  shadow maps land on it invisibly. Keep surfaces that need to receive a
  visible shadow near-dielectric.
- Chrome caches the module aggressively between runs; `render.sh` works around
  it by serving from a temporary origin per invocation.
