/**
 * Builds the HTML resource ChatGPT renders for a component (the "MCP App" UI).
 *
 * ChatGPT renders this HTML inside its iframe and injects `window.openai`
 * (carrying `toolOutput`, theme, `callTool`, etc.). The compiled widget bundle
 * (JS + Tailwind CSS) is inlined so the resource is fully self-contained — no
 * external asset hosting or cross-origin requests are required.
 *
 * Bundle is produced by `scripts/build-widgets.mjs` (esbuild + Tailwind) from
 * `widgets/entry.tsx`, which mounts the React components in `src/components`.
 */
export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export function widgetTemplateUri(component: string): string {
  return `ui://ringee/${component}`;
}

export interface WidgetAssets {
  js: string;
  css: string;
}

export function buildWidgetHtml(
  component: string,
  assets: WidgetAssets,
): string {
  const styleTag = assets.css ? `<style>${assets.css}</style>` : "";
  const scriptTag = assets.js
    ? `<script type="module">${assets.js}</script>`
    : `<div style="padding:16px;font:14px system-ui;color:#b45309">Widget bundle not built. Run <code>pnpm --filter @ringee-io/chatgpt-app build:widgets</code>.</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${styleTag}
  </head>
  <body>
    <div id="ringee-root" data-component="${component}"></div>
    ${scriptTag}
  </body>
</html>`;
}
