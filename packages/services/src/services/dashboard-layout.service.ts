import { Injectable, NotFoundException } from "@nestjs/common";
import {
  DashboardLayoutRepository,
  DashboardScope,
  UpsertWidgetInput,
} from "@ringee/database";
import type {
  DashboardLayout,
  DashboardWidget,
} from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";

type LayoutWithWidgets = DashboardLayout & { widgets: DashboardWidget[] };

/**
 * Default layout shipped to new users. Outcome-focused, 12-column grid.
 * Coordinates use react-grid-layout's units (cols=12).
 */
export const DEFAULT_DASHBOARD_WIDGETS: UpsertWidgetInput[] = [
  // KPI row
  { type: "kpi_total_calls", title: "Total Calls", x: 0, y: 0, w: 3, h: 2 },
  { type: "kpi_answered_calls", title: "Answered Calls", x: 3, y: 0, w: 3, h: 2 },
  { type: "kpi_meetings_booked", title: "Meetings Booked", x: 6, y: 0, w: 3, h: 2 },
  { type: "kpi_sales", title: "Sales Made", x: 9, y: 0, w: 3, h: 2 },

  { type: "kpi_interested", title: "Interested Leads", x: 0, y: 2, w: 3, h: 2 },
  { type: "kpi_follow_ups", title: "Follow-ups", x: 3, y: 2, w: 3, h: 2 },
  { type: "kpi_conversion_rate", title: "Conversion Rate", x: 6, y: 2, w: 3, h: 2 },
  { type: "kpi_meeting_rate", title: "Meeting Rate", x: 9, y: 2, w: 3, h: 2 },

  // Charts
  { type: "chart_outcome_funnel", title: "Outcome Funnel", x: 0, y: 4, w: 6, h: 5 },
  { type: "chart_outcomes_over_time", title: "Outcomes Over Time", x: 6, y: 4, w: 6, h: 5 },
  { type: "chart_best_time_of_day", title: "Best Hours to Call", x: 0, y: 9, w: 8, h: 5 },
  { type: "chart_calls_by_outcome", title: "Calls by Outcome", x: 8, y: 9, w: 4, h: 5 },

  // Tables
  { type: "table_recent_high_value_calls", title: "High-Value Calls", x: 0, y: 14, w: 6, h: 6 },
  { type: "table_upcoming_meetings", title: "Upcoming Meetings & Callbacks", x: 6, y: 14, w: 6, h: 6 },
  { type: "table_agent_performance", title: "Agent Performance", x: 0, y: 20, w: 12, h: 6 },
];

@Injectable()
export class DashboardLayoutService {
  constructor(private readonly repo: DashboardLayoutRepository) {}

  /**
   * Resolve scope from caller. Org admins/members default to "organization"
   * when in an org. Otherwise "personal".
   */
  resolveScope(
    ctx: OwnershipContext,
    requested?: DashboardScope,
  ): DashboardScope {
    if (requested) return requested;
    return ctx.organizationId ? "organization" : "personal";
  }

  /**
   * Get the user's dashboard layout for the requested scope, creating a
   * default one on first access.
   */
  async getOrCreateDefault(
    ctx: OwnershipContext,
    scope: DashboardScope,
  ): Promise<LayoutWithWidgets> {
    const existing = await this.repo.findDefault({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      scope,
    });
    if (existing) return existing;

    return this.repo.createDefault({
      userId: ctx.userId,
      organizationId: ctx.organizationId ?? null,
      scope,
      widgets: DEFAULT_DASHBOARD_WIDGETS,
    });
  }

  async replaceWidgets(
    ctx: OwnershipContext,
    scope: DashboardScope,
    widgets: UpsertWidgetInput[],
  ): Promise<LayoutWithWidgets | null> {
    const layout = await this.getOrCreateDefault(ctx, scope);
    return this.repo.replaceWidgets(layout.id, widgets);
  }

  async addWidget(
    ctx: OwnershipContext,
    scope: DashboardScope,
    widget: UpsertWidgetInput,
  ): Promise<DashboardWidget> {
    const layout = await this.getOrCreateDefault(ctx, scope);
    return this.repo.addWidget(layout.id, widget);
  }

  async updateWidget(
    ctx: OwnershipContext,
    widgetId: string,
    patch: Partial<UpsertWidgetInput>,
  ): Promise<DashboardWidget> {
    await this.assertOwnsWidget(widgetId, ctx);
    return this.repo.updateWidget(widgetId, patch);
  }

  async deleteWidget(
    ctx: OwnershipContext,
    widgetId: string,
  ): Promise<DashboardWidget> {
    await this.assertOwnsWidget(widgetId, ctx);
    return this.repo.deleteWidget(widgetId);
  }

  private async assertOwnsWidget(widgetId: string, ctx: OwnershipContext) {
    const owner = await this.repo.findWidgetOwner(widgetId);
    if (!owner) throw new NotFoundException("Widget not found");
    const sameUser = owner.userId === ctx.userId;
    const sameOrg = owner.organizationId === (ctx.organizationId ?? null);
    if (!sameUser || !sameOrg) {
      throw new NotFoundException("Widget not found");
    }
  }

  async assertOwnsLayout(
    layoutId: string,
    ctx: OwnershipContext,
  ): Promise<LayoutWithWidgets> {
    const layout = await this.repo.findById(layoutId);
    if (!layout) throw new NotFoundException("Dashboard layout not found");
    const sameUser = layout.userId === ctx.userId;
    const sameOrg =
      layout.organizationId === (ctx.organizationId ?? null);
    if (!sameUser || !sameOrg) {
      throw new NotFoundException("Dashboard layout not found");
    }
    return layout;
  }
}
