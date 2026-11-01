import { afterEach, describe, expect, it, vi } from "vitest";

/** The module reads its env once, when loaded; `undefined` unsets it. */
async function load(webUrl: string | undefined) {
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
    const { webAppUrl } = await load(" https://ringee.io/ ");

    expect(webAppUrl("/dashboard?upgrade=organization")).toBe(
      "https://ringee.io/dashboard?upgrade=organization",
    );
  });

  it.each([undefined, "", "   ", "ringee.io", "javascript:alert(1)"])(
    "opens production when the variable is %j",
    async (value) => {
      const { webAppUrl } = await load(value);

      expect(webAppUrl("/dashboard/lists")).toBe(
        "https://www.ringee.io/dashboard/lists",
      );
      // The sign-in screen shows this host.
      expect(new URL(webAppUrl()).host).toBe("www.ringee.io");
    },
  );
});
