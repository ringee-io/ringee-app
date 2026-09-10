import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { describeTelnyxError, isTelnyxCallEndedError } from "./telnyx.error";

const FALLBACK = "The voice provider rejected this configuration.";

describe("describeTelnyxError", () => {
  it("reads the provider's detail out of the exception body", () => {
    // This is the shape `TelnyxClient.handleError` rethrows: the provider's own
    // JSON body, wrapped in an HttpException.
    const error = new HttpException(
      {
        errors: [
          {
            title: "Invalid voice",
            detail: "The voice 'Telnyx.KokoroTTS.af' is not available.",
          },
        ],
      },
      422,
    );

    expect(describeTelnyxError(error, FALLBACK)).toBe(
      "The voice 'Telnyx.KokoroTTS.af' is not available.",
    );
  });

  it("names the field when the provider points at one", () => {
    const error = new HttpException(
      {
        errors: [
          {
            detail: "is required",
            source: { pointer: "/instructions" },
          },
        ],
      },
      422,
    );

    expect(describeTelnyxError(error, FALLBACK)).toBe(
      "instructions: is required",
    );
  });

  it("joins several provider errors rather than dropping all but one", () => {
    const error = new HttpException(
      { errors: [{ detail: "too long" }, { title: "unsupported model" }] },
      422,
    );

    expect(describeTelnyxError(error, FALLBACK)).toBe(
      "too long · unsupported model",
    );
  });

  it("falls back rather than surfacing Nest's 'Http Exception' placeholder", () => {
    // The bug this function exists for: an object body leaves `.message` as the
    // class default, and storing that shows a user an error that says nothing.
    const error = new HttpException({ something: "unrecognised" }, 500);

    expect(error.message).toBe("Http Exception");
    expect(describeTelnyxError(error, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back on an axios-shaped message with no detail", () => {
    expect(
      describeTelnyxError(
        new Error("Request failed with status code 422"),
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("keeps a real message from a plain Error", () => {
    expect(
      describeTelnyxError(
        new Error("Assistant vanished during update"),
        FALLBACK,
      ),
    ).toBe("Assistant vanished during update");
  });

  it("reads a string body", () => {
    expect(
      describeTelnyxError(new HttpException("Not found", 404), FALLBACK),
    ).toBe("Not found");
  });

  it("falls back for anything unrecognisable", () => {
    expect(describeTelnyxError(undefined, FALLBACK)).toBe(FALLBACK);
    expect(describeTelnyxError({}, FALLBACK)).toBe(FALLBACK);
  });
});

describe("isTelnyxCallEndedError", () => {
  /** What a `streaming_stop` racing a hangup actually comes back as. */
  const callEnded = new HttpException(
    {
      errors: [
        {
          code: "90018",
          title: "Call has already ended",
          detail: "This call is no longer active and can't receive commands.",
        },
      ],
    },
    422,
  );

  it("recognises the provider's 'call has already ended' rejection", () => {
    expect(isTelnyxCallEndedError(callEnded)).toBe(true);
  });

  it("recognises it before TelnyxClient wraps the axios error", () => {
    expect(
      isTelnyxCallEndedError({
        response: { status: 422, data: { errors: [{ code: 90018 }] } },
      }),
    ).toBe(true);
  });

  it("does not swallow any other provider failure", () => {
    expect(
      isTelnyxCallEndedError(
        new HttpException({ errors: [{ code: "10015" }] }, 422),
      ),
    ).toBe(false);
    expect(isTelnyxCallEndedError(new Error("socket hang up"))).toBe(false);
    expect(isTelnyxCallEndedError(undefined)).toBe(false);
  });
});
