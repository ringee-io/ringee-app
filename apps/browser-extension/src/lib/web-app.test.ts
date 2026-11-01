import { afterEach, describe, expect, it, vi } from "vitest";

/** The module reads its env once, when loaded. */
async function load(webUrl: string) {
  vi.resetModules();
  vi.stubEnv("VITE_RINGEE_WEB_URL", webUrl);
  return import("./web-app");
}

describe("webAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("opens pages on the web app, not on Clerk's sync host", async () => {
    vi.stubEnv("VITE_CLERK_SYNC_HOST", "https://clerk.ringee.io");
    const { webAppUrl } = await load("https://ringee.io");

    expect(webAppUrl("/dashboard/lists")).toBe(
      "https://ringee.io/dashboard/lists",
    );
    expect(webAppUrl()).toBe("https://ringee.io/");
  });

  it("joins without a double slash when the variable ends with one", async () => {
    const { webAppUrl } = await load("https://ringee.io/");

    expect(webAppUrl("/dashboard?upgrade=organization")).toBe(
      "https://ringee.io/dashboard?upgrade=organization",
    );
  });
});
