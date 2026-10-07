# Marketing visuals

How the marketing site's non-screenshot imagery is produced and displayed.

## Marketing portraits

The homepage uses `CallingHero` with the supplied transparent portraits in
`apps/frontend/public/hero/`: `human-white.png` and `robot-white.png` in light
mode, and `human-dark.png` and `robot-dark.png` in dark mode. The human stays
on the left and the AI agent on the right, connected to one shared calling
stack below. On smaller screens the copy sits above the pair.

The AI Voice Agents page reuses the robot through `OperatorPortrait`, in the
standard `DetailLayout` with its left-hand page navigation.

The composition and light connections live in `calling-hero.module.css`.
Theme selection uses CSS and `next/image` with native lazy loading so the
hidden variant does not download on first paint. Labels and capabilities stay
in markup, with copy in the `marketing.callingHero` translation namespace.

## Wall of love

`/wall-of-love`, and its share on the home page, render
`content/wall-of-love.ts`: LinkedIn posts and comments, WhatsApp chats, X
posts, Trustpilot reviews, emails and video testimonials, each card drawn
after its network. The file's header explains how to add one.

- A testimonial is a quote: copied word for word, never written or tidied. A
  public original is linked with `url` and the whole card opens it; a private
  chat or email needs its author's OK and goes in with phone numbers cropped
  out.
- An entry its author was rewarded for (the `customer-review` offer pays
  credits for a Trustpilot review), or that someone close to the team wrote,
  is marked `incentivized`, and its card says so.
- Photos, screenshots and videos live in `apps/frontend/public/wall-of-love/`.
  A changed file needs a new name, because images are cached as immutable for
  a year.
- The home page shows the `featured` entries, or the first six. Resting the
  pointer on one opens the whole wall over the page (at most every two
  minutes); `/wall-of-love` is the same wall on a stage that follows the
  site's light or dark theme, like the cards themselves. The motion is
  in `wall-of-love-motion.tsx` and `wall-of-love.module.css`, and
  `prefers-reduced-motion` stills all of it.
- The lit card's glow is one layer beside the CSS columns, never inside a
  card: an overflowing child of a card in columns is carried into the
  neighbouring column.

## Legacy 3D render

`apps/frontend/public/hero/human-ai-operators.webp` is an earlier experiment,
retained with its scene source and rendering recipe. The current marketing
heroes use the portraits above. The legacy image shows a teammate on a headset
standing next to a voice agent, both lit as a single scene.

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
