"use client";

import { COMPONENTS } from "@/components/registry";
import { ErrorState } from "@/components/states";
import { useToolOutput } from "@/lib/openai";

/**
 * The surface ChatGPT embeds in its iframe. It reads the tool output from
 * `window.openai.toolOutput` and renders the matching component; standalone it
 * falls back to demo data so the same URL is previewable in a browser.
 */
export function RenderClient({ component }: { component: string }) {
  const entry = COMPONENTS[component];
  // Hooks must run unconditionally — fall back to an empty object if unknown.
  const data = useToolOutput<unknown>(entry?.mock ?? {});

  if (!entry) {
    return (
      <div className="p-4">
        <ErrorState
          title="Unknown component"
          description={`No component named "${component}". Known: ${Object.keys(
            COMPONENTS,
          ).join(", ")}.`}
        />
      </div>
    );
  }

  return <div className="p-3">{entry.render(data)}</div>;
}
