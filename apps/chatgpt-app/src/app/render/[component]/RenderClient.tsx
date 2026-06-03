"use client";

import { COMPONENTS } from "@/components/registry";
import { ErrorState } from "@/components/states";
import { useIsEmbedded, useToolOutputRaw } from "@/lib/openai";

/**
 * Standalone surface for one component. Reads the tool output from
 * `window.openai.toolOutput` and renders the matching component; embedded but
 * not ready → the loading skeleton; standalone (plain browser) → demo data.
 */
export function RenderClient({ component }: { component: string }) {
  const entry = COMPONENTS[component];
  // Hooks must run unconditionally.
  const embedded = useIsEmbedded();
  const output = useToolOutputRaw<unknown>();

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

  if (embedded && output == null) {
    return <div className="p-3">{entry.skeleton}</div>;
  }

  const data = output ?? entry.mock;
  return <div className="p-3">{entry.render(data)}</div>;
}
