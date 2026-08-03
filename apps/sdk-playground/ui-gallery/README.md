# Dialer SDK — UI visual playground

Renders **every state** of the Floating dialer and the Dialer Bar (login, OTP,
ready, dialing/ringing, in-call, keypad, errors, ended) as frozen tiles, plus a
**live, clickable demo** of both surfaces — all driven by a no-network
`MockDialer`, so no backend, publishable key or real phone call is needed.

The tiles use the exact same components, styles and state machine as production
(`packages/dialer-sdk/src/ui`), so what you see here is what a CRM embeds via
`Ringee.createFloating()` / `Ringee.createBar()`.

## Run

```bash
# From the repo root — bundles gallery.ts (+ the SDK source) into gallery.js
node apps/sdk-playground/ui-gallery/build.mjs

# Then open index.html (any static server, or straight from disk)
open apps/sdk-playground/ui-gallery/index.html
```

- `?theme=dark` on the URL (or the **Theme** button) switches every surface to the
  dark palette.
- Resize the window / the bar tiles to watch the Dialer Bar collapse via
  container queries.

## Files

| File         | What                                                    |
| ------------ | ------------------------------------------------------- |
| `index.html` | Page shell + gallery styling                            |
| `gallery.ts` | Builds the frozen state tiles + the live demo           |
| `build.mjs`  | esbuild bundler (wires the `@ringee/dialer-core` alias) |

The fake dialer lives in the SDK itself, at
`packages/dialer-sdk/src/demo/mock-dialer.ts` — a drop-in stand-in for
`RingeeDialer` with no network and no WebRTC. It is shared with the public
`/dialer-sdk` marketing demo so both show the same real UI; it is not a package
export, so published consumers never see it.
