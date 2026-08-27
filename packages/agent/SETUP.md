# Setting up the Ringee plugin

The plugin ships no credentials of its own. Everything it does goes through the
**Ringee MCP**, so the one thing you must provide is **your Ringee MCP URL**.

## 1. Get your Ringee MCP URL

In the Ringee dashboard: **Settings → Integrations → Connectors → MCP**, then copy
the URL shown on that card. It looks like one of these:

```text
https://api.ringee.io/api/mcp/<userId>/sse                  # personal workspace
https://api.ringee.io/api/mcp/<userId>/<organizationId>/sse # organization workspace
```

Which one you get depends on the workspace that is active when you open the page
(`GET /api/mcp/connection-info` returns `mode: "freelancer"` or `"organization"`).

> **Treat this URL like a password.** It authenticates by itself — anyone holding
> it can read and act on your Ringee data. Don't paste it into shared docs, issues
> or screenshots. If it leaks, rotate it from the same screen.

## 2. Connect it

**Claude Code** — run `/plugin`, open **Ringee**, and paste the URL into
**Ringee MCP URL**. It is stored in your OS keychain, not in the repo. Then
restart the session (or run `/reload-plugins`) so the `ringee` MCP server starts.

**claude.ai** — plugins carry their MCP with them; if you are connecting Ringee
manually instead, go to **Settings → Connectors → Add custom connector** and paste
the same URL. The endpoint must be reachable from the public internet — a
`localhost` URL will not work.

## 3. Verify

Ask Claude:

```text
List my Ringee workspaces
```

That calls `list_workspaces`. If you get your workspaces back, the connection is
live. If you get nothing, check in order:

| Symptom                      | Cause                                                                     |
| ---------------------------- | ------------------------------------------------------------------------- |
| No Ringee tools at all       | Plugin disabled, or the session predates the config — restart Claude Code |
| Connection/401 errors        | Wrong or truncated URL — re-copy it from the dashboard                    |
| Tools work but data is empty | You're on the wrong workspace — see below                                 |

## 4. Workspaces

The URL is bound to the workspace it was generated for. To move between your
personal workspace and an organization, use `switch_workspace` (after
`list_workspaces`) rather than editing the URL by hand. The switch takes effect on
the **next** request.

## What you get once connected

Skills: `ringee` (the hub), `ringee-prospect`, `ringee-contacts`,
`ringee-session`, `ringee-followup`, `ringee-flow`.

Sensitive actions (spending provider credits on lead reveals, minting call-session
magic links) and destructive ones (deleting a contact, revoking a session) always
ask for explicit confirmation first — that is enforced by the skills themselves.
