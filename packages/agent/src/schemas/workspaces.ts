import { z } from "zod";

/**
 * Workspace switching. ChatGPT (and any OAuth caller) authenticates once and
 * operates inside the *active* workspace — the user's Personal account or one
 * of their organizations. These tools list and change that selection without a
 * re-login; everything else is scoped to whatever is active.
 */

export const ListWorkspacesSchema = z.object({});

export const SwitchWorkspaceSchema = z.object({
  workspaceId: z
    .string()
    .min(1)
    .max(100)
    .describe(
      "Which workspace to operate in. Pass the literal 'personal' for the " +
        "user's own account, or an organization id from list_workspaces (an " +
        "exact organization name also works). Applies to all subsequent actions.",
    ),
});

export type ListWorkspacesInput = z.infer<typeof ListWorkspacesSchema>;
export type SwitchWorkspaceInput = z.infer<typeof SwitchWorkspaceSchema>;
