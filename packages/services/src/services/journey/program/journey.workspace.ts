/**
 * The two kinds of Journey workspace.
 *
 * Its own module so `journey.tracks.ts` and `journey.program.ts` can both name
 * the type without importing each other — the program imports the tracks, and
 * the tracks need the workspace type. One shared leaf breaks the cycle.
 */

export type JourneyWorkspaceType = "personal" | "organization";

export const JOURNEY_WORKSPACE_TYPES = [
  "personal",
  "organization",
] as const satisfies readonly JourneyWorkspaceType[];
