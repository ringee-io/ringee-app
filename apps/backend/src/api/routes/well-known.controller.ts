import { Controller, Get, Res } from "@nestjs/common";
import { Public } from "@ringee/platform";
import type { Response } from "express";

/**
 * Origin-root `/.well-known` endpoints.
 *
 * These are intentionally served *outside* the global `/api` prefix (see the
 * `exclude` list in `main.ts`) because verification crawlers fetch them at the
 * bare hostname root, e.g. `https://api.ringee.io/.well-known/...`.
 */
@Controller()
export class WellKnownController {
  /**
   * OpenAI Apps SDK domain-verification challenge.
   *
   * OpenAI's developer portal asks us to expose a fixed token at this path so
   * it can confirm we control the MCP hostname. The response is the raw token
   * as `text/plain`. The token is configurable via the
   * `OPENAI_APPS_CHALLENGE_TOKEN` env var; the fallback is the value OpenAI
   * issued for api.ringee.io.
   */
  @Public()
  @Get(".well-known/openai-apps-challenge")
  openaiAppsChallenge(@Res() res: Response): void {
    const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN;

    res.type("text/plain").send(token);
  }
}
