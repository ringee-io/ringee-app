/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JOURNEY_PROGRAM_2026_09 } from "./program/journey.program";
import { JOURNEY_WORKSPACE_TYPES } from "./program/journey.workspace";
import { journeyNodes } from "./program/journey.program";

/**
 * The route contract between the program and the app.
 *
 * Every requirement names an `actionKey`, and the frontend turns that into a
 * link. v2 shipped five action keys pointing at routes that had never existed
 * (`/dashboard/numbers`, `/dashboard/organization`, `/dashboard/integrations`,
 * `/dashboard/ai-pipelines`, `/dashboard/settings/recording`), so the primary
 * call to action on those steps was a 404 — the single worst thing an
 * onboarding surface can do.
 *
 * These tests resolve the map against the real App Router tree on disk. A route
 * that is deleted or renamed fails the build rather than the user's click.
 */

const FRONTEND = join(__dirname, "../../../../../apps/frontend/src");
const APP_DIR = join(FRONTEND, "app");
const PRESENTATION = join(FRONTEND, "features/journey/lib/presentation.ts");

/** Parses the ACTION_ROUTES literal out of the presentation module. */
function readActionRoutes(): Record<string, string> {
  const source = readFileSync(PRESENTATION, "utf8");
  const start = source.indexOf(
    "const ACTION_ROUTES: Record<string, string> = {",
  );
  assert.ok(start >= 0, "ACTION_ROUTES not found in presentation.ts");
  const end = source.indexOf("};", start);
  const body = source.slice(start, end);

  const routes: Record<string, string> = {};
  for (const [, key, value] of body.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) {
    routes[key] = value;
  }
  return routes;
}

/**
 * True when a Next.js App Router route renders at this path.
 *
 * Handles the three ways a page can legitimately live somewhere other than
 * `app/<path>/page.tsx`: route groups, which are transparent in the URL; and
 * catch-all / optional-catch-all segments, which `/dashboard/profile` uses
 * (`profile/[[...profile]]/page.tsx`) because Clerk owns its sub-routes.
 */
function routeExists(route: string): boolean {
  const segments = route.replace(/^\//, "").split("/");
  const groups = ["", "(marketing)", "(dashboard)", "(auth)"];

  for (const group of groups) {
    const base = group ? join(APP_DIR, group) : APP_DIR;

    if (existsSync(join(base, ...segments, "page.tsx"))) return true;

    // A catch-all directory directly under the route also serves it.
    const parent = join(base, ...segments);
    if (existsSync(parent)) {
      const catchAll = readdirSync(parent).find((entry) =>
        /^\[\[?\.\.\..+?\]\]?$/.test(entry),
      );
      if (catchAll && existsSync(join(parent, catchAll, "page.tsx"))) {
        return true;
      }
    }
  }
  return false;
}

const routes = readActionRoutes();
const program = JOURNEY_PROGRAM_2026_09;

describe("journey action routes — every CTA resolves", () => {
  it("maps every action key the program can produce", () => {
    const keys = new Set<string>();
    for (const type of JOURNEY_WORKSPACE_TYPES) {
      for (const node of journeyNodes(program, type)) {
        for (const requirement of node.requirements) {
          keys.add(requirement.actionKey);
        }
      }
    }

    for (const key of keys) {
      assert.ok(
        routes[key],
        `action key "${key}" has no route in presentation.ts`,
      );
    }
  });

  it("points every route at a page that exists", () => {
    const broken: string[] = [];
    for (const [key, route] of Object.entries(routes)) {
      if (!routeExists(route)) broken.push(`${key} -> ${route}`);
    }
    assert.deepEqual(
      broken,
      [],
      `dead Journey CTA routes: ${broken.join(", ")}`,
    );
  });

  it("never points at the routes v2 shipped broken", () => {
    // Regression pin. These five were in the v2 map and none of them existed.
    const known404s = [
      "/dashboard/numbers",
      "/dashboard/organization",
      "/dashboard/integrations",
      "/dashboard/ai-pipelines",
      "/dashboard/settings/recording",
    ];
    for (const route of Object.values(routes)) {
      assert.ok(
        !known404s.includes(route),
        `${route} does not exist and must not be linked`,
      );
    }
  });

  it("keeps every route inside the dashboard", () => {
    for (const [key, route] of Object.entries(routes)) {
      assert.ok(
        route.startsWith("/dashboard/"),
        `${key} points outside the dashboard: ${route}`,
      );
    }
  });

  it("has a team route, because invite_team had nowhere to go", () => {
    assert.equal(routes.invite_team, "/dashboard/settings/team");
    assert.ok(routeExists("/dashboard/settings/team"));
  });
});
