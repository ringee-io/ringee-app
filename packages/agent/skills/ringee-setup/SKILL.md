---
name: ringee-setup
description: Connect the Ringee MCP so the other Ringee skills work — get the MCP URL from the Ringee dashboard, configure it in Claude Code or claude.ai, verify the connection, and pick the right workspace. Use when Ringee tools are missing, return connection/401 errors, or the user is installing Ringee for the first time.
---

# Ringee setup

Get the user connected to the **Ringee MCP**. Everything else in this plugin
depends on it. Do not attempt any other Ringee action until `list_workspaces`
succeeds.

## Diagnose first

Call `list_workspaces`. Then:

- **It works** → connected. Report the active workspace and stop; do not walk the
  user through setup they don't need.
- **No Ringee tools exist** → the plugin is off or the session predates the
  config. Go to step 1.
- **Connection / 401 / 404 errors** → the URL is wrong, truncated, or rotated.
  Go to step 1.
- **Works but the data looks empty or foreign** → wrong workspace. Go to
  "Workspaces".

## 1. Get the URL

Tell the user to open the Ringee dashboard: **Settings → Integrations →
Connectors → MCP**, and copy the URL from that card. Shape:

```text
https://api.ringee.io/api/mcp/<userId>/sse                  # personal
https://api.ringee.io/api/mcp/<userId>/<organizationId>/sse # organization
```

**This URL is a credential** — it authenticates on its own. Never ask the user to
paste it into the chat, and never echo it back if they do. It belongs in the
config field only. If it has already leaked, tell them to rotate it from the same
screen.

## 2. Configure

- **Claude Code** — `/plugin` → **Ringee** → paste into **Ringee MCP URL**
  (stored in the OS keychain). Then restart the session or `/reload-plugins`.
- **claude.ai** — **Settings → Connectors → Add custom connector**, same URL. It
  must be publicly reachable; `localhost` will not work.

You cannot set this for the user — it is entered through the UI. Give the exact
clicks and wait.

## 3. Verify

Call `list_workspaces` again and report which workspace is active. Then point at
the next step: `ringee` for the hub, or `ringee-flow` for the full outbound run.

## Workspaces

The URL is bound to the workspace it was minted for. To move between personal and
organization, use `switch_workspace` (after `list_workspaces`) — never hand-edit
the URL. The switch applies on the **next** request, so re-read before acting on
the new workspace.

## Rules

1. Never invent, guess, or reconstruct an MCP URL. It comes from the dashboard.
2. Never print, log, or repeat the URL, in full or in part.
3. If setup fails twice, stop and point the user at `SETUP.md` in the plugin
   rather than looping through the same steps again.
