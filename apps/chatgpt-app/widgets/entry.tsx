/**
 * Widget bundle entry — the browser build that ChatGPT runs inside its iframe.
 *
 * One bundle serves every component; the active one is selected by the
 * `data-component` attribute on the mount node (set by the MCP server's HTML
 * resource). The component reads its data from `window.openai.toolOutput` via
 * the shared `useToolOutput` hook and re-renders on host updates.
 *
 * Built by `scripts/build-widgets.mjs` into `dist/widgets/widget.js` and inlined
 * into the resource by `src/server/mcp-server.ts`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { COMPONENTS } from "@/components/registry";
import { ErrorState } from "@/components/states";
import { useToolOutput } from "@/lib/openai";

function Widget({ component }: { component: string }) {
  const entry = COMPONENTS[component];
  const data = useToolOutput<unknown>(entry?.mock ?? {});
  if (!entry) {
    return (
      <div className="p-4">
        <ErrorState
          title="Unknown component"
          description={`No Ringee component named "${component}".`}
        />
      </div>
    );
  }
  return <div className="p-3">{entry.render(data)}</div>;
}

const root = document.getElementById("ringee-root");
if (root) {
  const component = root.dataset.component ?? "ContactCard";
  createRoot(root).render(
    <StrictMode>
      <Widget component={component} />
    </StrictMode>,
  );
}
