"use client";

import { useState } from "react";
import type {
  ListWorkspacesResult,
  SwitchWorkspaceResult,
  Workspace,
} from "@ringee-io/agent";
import { Building2, Check, Loader2, User } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { callToolData, sendFollowup } from "@/lib/openai";

/** Short, human role label for an organization workspace ("org:admin" → "Admin"). */
function roleLabel(role: string | null): string | null {
  if (!role) return null;
  const base = role.includes(":") ? role.split(":").pop()! : role;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function WorkspaceRow({
  workspace,
  switching,
  onSwitch,
}: {
  workspace: Workspace;
  switching: boolean;
  onSwitch: (ws: Workspace) => void;
}) {
  const isOrg = workspace.type === "organization";
  const Icon = isOrg ? Building2 : User;
  const subtitle = isOrg
    ? (roleLabel(workspace.role) ?? "Member")
    : "Your account";

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{workspace.name}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      {workspace.active ? (
        <Badge variant="success">
          <Check /> Active
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={switching}
          onClick={() => onSwitch(workspace)}
        >
          {switching ? <Loader2 className="animate-spin" /> : null}
          Switch
        </Button>
      )}
    </li>
  );
}

export function WorkspaceCard({ data }: { data: ListWorkspacesResult }) {
  // Switching swaps the active workspace in place (no model round-trip). Falls
  // back to a follow-up turn when the host can't call tools (gallery).
  const [override, setOverride] = useState<ListWorkspacesResult | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const current = override ?? data;
  const workspaces = Array.isArray(current.workspaces) ? current.workspaces : [];

  async function switchTo(ws: Workspace) {
    if (pendingId || ws.active) return;
    setPendingId(ws.id);
    const next = await callToolData<SwitchWorkspaceResult>("switch_workspace", {
      workspaceId: ws.id,
    });
    setPendingId(null);
    if (next && Array.isArray(next.workspaces)) {
      setOverride(next);
    } else {
      // Host can't run tools here — let the model perform the switch.
      void sendFollowup(`Switch to the ${ws.name} workspace`);
    }
  }

  const activeName =
    workspaces.find((w) => w.active)?.name ?? "Personal";

  return (
    <Card className="w-full max-w-md overflow-hidden">
      <CardHeader className="flex-col items-stretch gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Building2 className="size-4" />
            </div>
            <h3 className="text-base font-semibold leading-tight">Workspaces</h3>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            Active: {activeName}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {workspaces.map((ws) => (
            <WorkspaceRow
              key={ws.id}
              workspace={ws}
              switching={pendingId === ws.id}
              onSwitch={switchTo}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
