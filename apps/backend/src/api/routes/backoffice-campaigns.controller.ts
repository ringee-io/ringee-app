import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from "@nestjs/common";
import { BackofficeCampaignService } from "@ringee/services";
import type { CampaignOwnerScope, CampaignSortKey } from "@ringee/database";
import { SuperAdminOnly } from "../guards/super-admin.guard";
import { parseAccountFilter, parseRange } from "./backoffice-filters";

const SORT_KEYS: CampaignSortKey[] = [
  "attempts",
  "cost",
  "connected",
  "conversions",
  "leads",
  "created",
  "lastActivity",
  "name",
];

const STATUSES = ["draft", "active", "paused", "completed"];

function parseSort(value?: string): CampaignSortKey | undefined {
  return SORT_KEYS.includes(value as CampaignSortKey)
    ? (value as CampaignSortKey)
    : undefined;
}

function parseOwnerScope(value?: string): CampaignOwnerScope | undefined {
  return value === "org" || value === "personal" || value === "all"
    ? value
    : undefined;
}

function parseStatus(value?: string): string | undefined {
  if (!value || value === "all") return undefined;
  if (!STATUSES.includes(value)) {
    throw new BadRequestException(
      `status must be one of ${STATUSES.join(", ")}`,
    );
  }
  return value;
}

/**
 * Cross-tenant campaign analytics for the internal super-admin area. Gated by
 * the email allowlist via @SuperAdminOnly() — this is the real access boundary;
 * the frontend gate is UX only.
 */
@Controller("backoffice/campaigns")
@SuperAdminOnly()
export class BackofficeCampaignsController {
  constructor(private readonly campaigns: BackofficeCampaignService) {}

  @Get()
  list(
    @Query()
    q: {
      start?: string;
      end?: string;
      search?: string;
      status?: string;
      userId?: string;
      organizationId?: string;
      ownerScope?: string;
      onlyNew?: string;
      sort?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const { start, end } = parseRange(q);
    return this.campaigns.listCampaigns({
      start,
      end,
      search: q.search,
      status: parseStatus(q.status),
      ...parseAccountFilter(q),
      ownerScope: parseOwnerScope(q.ownerScope),
      onlyNew: q.onlyNew === "true",
      sort: parseSort(q.sort),
      page: Number(q.page) || 1,
      pageSize: Number(q.pageSize) || 25,
    });
  }

  @Get("organizations")
  listOrganizations() {
    return this.campaigns.listOrganizationOptions();
  }

  @Get(":id")
  detail(
    @Param("id") id: string,
    @Query() q: { start?: string; end?: string },
  ) {
    const { start, end } = parseRange(q);
    return this.campaigns.getCampaignDetail(id, start, end);
  }

  @Get(":id/attempts")
  attempts(
    @Param("id") id: string,
    @Query()
    q: { start?: string; end?: string; page?: string; pageSize?: string },
  ) {
    const { start, end } = parseRange(q);
    return this.campaigns.listAttempts({
      campaignId: id,
      start,
      end,
      page: Number(q.page) || 1,
      pageSize: Number(q.pageSize) || 25,
    });
  }
}
