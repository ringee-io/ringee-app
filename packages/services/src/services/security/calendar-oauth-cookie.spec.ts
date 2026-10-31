import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { CalendarController } from "../../../../../apps/backend/src/api/routes/calendar.controller";

describe("calendar OAuth browser binding", () => {
  for (const provider of ["google", "microsoft"] as const) {
    it(`stores a hash and verifies the ${provider} callback against it`, async () => {
      const state = "test-random-oauth-state";
      let cookie = "";
      let connected = 0;
      let consumed = 0;
      let cleared = 0;
      const redirectUrls: string[] = [];
      const service = {
        beginOAuth: async () => state,
        getGoogleOAuthUrl: () => "https://accounts.google.com/authorize",
        getMicrosoftOAuthUrl: () =>
          "https://login.microsoftonline.com/authorize",
        consumeOAuth: async (_provider: string, input: string) => {
          assert.equal(input, state);
          consumed++;
          return {
            userId: "user-1",
            organizationId: "org-1",
            calendarId: null,
          };
        },
        exchangeGoogleCode: async () => ({}),
        exchangeMicrosoftCode: async () => ({}),
        connectCalendar: async () => {
          connected++;
        },
      };
      const controller = new CalendarController(service as never);
      const response = {
        cookie: (
          _name: string,
          value: string,
          options: { httpOnly: boolean; sameSite: string },
        ) => {
          cookie = value;
          assert.equal(options.httpOnly, true);
          assert.equal(options.sameSite, "lax");
        },
        clearCookie: () => {
          cleared++;
        },
        redirect: (url: string) => {
          redirectUrls.push(url);
        },
      };
      await controller[`${provider}OAuthRedirect`](
        { id: "user-1", activeOrgId: "org-1" } as never,
        response as never,
      );
      assert.equal(
        cookie,
        createHash("sha256").update(state).digest("base64url"),
      );
      assert.notEqual(cookie, state);
      const request = {
        headers: { cookie: `ringee_calendar_oauth=${cookie}` },
        protocol: "https",
        get: () => "api.example.com",
      };
      await controller[`${provider}OAuthCallback`](
        "code",
        state,
        request as never,
        response as never,
      );
      assert.equal(connected, 1);
      assert.equal(consumed, 1);
      assert.ok(redirectUrls.at(-1)?.includes("calendar=connected"));
      request.headers.cookie = "ringee_calendar_oauth=wrong-browser";
      await controller[`${provider}OAuthCallback`](
        "code",
        state,
        request as never,
        response as never,
      );
      assert.equal(connected, 1);
      assert.equal(consumed, 1);
      assert.equal(cleared, 2);
      assert.ok(redirectUrls.at(-1)?.includes("calendar=error"));
    });
  }
});
