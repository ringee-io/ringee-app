---
name: ringee-setup
description: Connect the Ringee MCP so the other Ringee skills work — create an API key in the Ringee dashboard (or use the legacy connector URL), configure it in Claude Code or claude.ai, verify the connection, and pick the right workspace. Use when Ringee tools are missing, return connection/401 errors, or the user is installing Ringee for the first time.
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
- **401 "This API key has been revoked"** → the key was revoked. Go to step 1 and
  create a new one.
- **Other connection / 401 / 404 errors** → the key or URL is wrong or
  truncated. Go to step 1.
- **Works but the data looks empty or foreign** → wrong workspace. Go to
  "Workspaces".

## 1. Get a credential

**Recommended — an API key.** Tell the user to open the Ringee dashboard:
**Settings → Connectors → API keys → Create API key**, name it after the client
("Claude Code on my laptop") and copy it. Keys start with `ringee_sk_`, are shown
once, and can be revoked one by one from the same screen.

**Legacy — the connector URL**, for clients that cannot send headers (the
claude.ai custom-connector form, the Ringee plugin's "Ringee MCP URL" field). It
is under **Settings → Connectors → Legacy connection URL**:

```text
https://api.ringee.io/api/mcp/<userId>/sse                  # personal
https://api.ringee.io/api/mcp/<userId>/<organizationId>/sse # organization
```

**Both are credentials.** Never ask the user to paste either into the chat, and
never echo one back if they do. They belong in the client's config only. A
leaked key is revoked from the API keys list; a leaked URL needs support.

## 2. Configure

- **Claude Code, with an API key** — the user runs:

  ```bash
  claude mcp add --transport http ringee https://api.ringee.io/api/mcp \
    --header "Authorization: Bearer <their key>"
  ```

  Then restart the session or `/reload-plugins`.

- **Claude Code, with the plugin** — `/plugin` → **Ringee** → paste the legacy
  URL into **Ringee MCP URL** (stored in the OS keychain), then reload.
- **Cursor, Windsurf, VS Code and other MCP clients** — server URL
  `https://api.ringee.io/api/mcp`, header `Authorization: Bearer <key>`. The
  dashboard shows a ready-to-paste JSON block after creating the key.
- **claude.ai** — **Settings → Connectors → Add custom connector** with the
  legacy URL. It must be publicly reachable; `localhost` will not work.
- **A terminal or shell-running agent** — `npm i -g ringee && ringee login`
  opens the browser to authorize the terminal; no key to copy.

You cannot set this for the user — it is entered through their client. Give the
exact commands and clicks, and wait.

## 3. Verify

Call `list_workspaces` again and report which workspace is active. Then point at
the next step: `ringee` for the hub, or `ringee-flow` for the full outbound run.

## Workspaces

An API key acts as the user; requests run in the user's **active workspace**.
A legacy URL is bound to the workspace it was copied for. Either way, move
between personal and organization with `switch_workspace` (after
`list_workspaces`) — never hand-edit a URL. The switch applies on the **next**
request, so re-read before acting on the new workspace.

## Rules

1. Never invent, guess, or reconstruct an API key or MCP URL. Both come from the
   dashboard.
2. Never print, log, or repeat a key or URL, in full or in part.
3. If setup fails twice, stop and point the user at `SETUP.md` in the plugin
   rather than looping through the same steps again.
