import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { resolveSuperAdmin } from "../guards/super-admin.guard";

/**
 * Tells the caller whether they may see the backoffice UI.
 *
 * Deliberately NOT `@SuperAdminOnly()`: every authenticated user may ask, and a
 * non-admin simply gets `false`. This exists so the dashboard never keeps its
 * own copy of the allowlist — the UI gate and `SuperAdminGuard` read the same
 * source, so they cannot drift.
 *
 * This is still only a UX gate. `SuperAdminGuard` on the backoffice routes is
 * the real access boundary.
 */
@Controller("backoffice")
export class BackofficeAccessController {
  @Get("access")
  async getAccess(
    @Req() req: Request & { clerkUserId?: string },
  ): Promise<{ isSuperAdmin: boolean }> {
    const clerkUserId = req.clerkUserId;
    if (!clerkUserId) return { isSuperAdmin: false };
    return { isSuperAdmin: await resolveSuperAdmin(clerkUserId) };
  }
}
