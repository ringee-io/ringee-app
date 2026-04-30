import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Prisma } from "@prisma/client";

export type DashboardScope = "personal" | "organization";

export interface UpsertWidgetInput {
  id?: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Prisma.InputJsonValue | null;
  isVisible?: boolean;
}

@Injectable()
export class DashboardLayoutRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Find the user's default dashboard for a given scope.
   * If scope === "organization", organizationId must be supplied.
   */
  findDefault(opts: {
    userId: string;
    organizationId: string | null;
    scope: DashboardScope;
  }) {
    return this.prisma.dashboardLayout.findFirst({
      where: {
        userId: opts.userId,
        organizationId:
          opts.scope === "organization" ? opts.organizationId : null,
        scope: opts.scope,
        isDefault: true,
      },
      include: { widgets: { orderBy: [{ y: "asc" }, { x: "asc" }] } },
    });
  }

  findById(id: string) {
    return this.prisma.dashboardLayout.findUnique({
      where: { id },
      include: { widgets: { orderBy: [{ y: "asc" }, { x: "asc" }] } },
    });
  }

  /**
   * Returns the owning layout's userId/organizationId for a given widget.
   * Used for ownership checks on per-widget mutations.
   */
  async findWidgetOwner(widgetId: string) {
    const widget = await this.prisma.dashboardWidget.findUnique({
      where: { id: widgetId },
      select: {
        dashboard: { select: { userId: true, organizationId: true } },
      },
    });
    if (!widget) return null;
    return {
      userId: widget.dashboard.userId,
      organizationId: widget.dashboard.organizationId,
    };
  }

  createDefault(opts: {
    userId: string;
    organizationId: string | null;
    scope: DashboardScope;
    widgets: UpsertWidgetInput[];
  }) {
    return this.prisma.dashboardLayout.create({
      data: {
        userId: opts.userId,
        organizationId:
          opts.scope === "organization" ? opts.organizationId : null,
        scope: opts.scope,
        isDefault: true,
        name: "Default",
        widgets: {
          create: opts.widgets.map((w) => ({
            type: w.type,
            title: w.title,
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
            config: (w.config ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            isVisible: w.isVisible ?? true,
          })),
        },
      },
      include: { widgets: { orderBy: [{ y: "asc" }, { x: "asc" }] } },
    });
  }

  /**
   * Replace all widgets on the dashboard with the given set (transactional).
   */
  async replaceWidgets(dashboardId: string, widgets: UpsertWidgetInput[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.dashboardWidget.deleteMany({ where: { dashboardId } });
      if (widgets.length > 0) {
        await tx.dashboardWidget.createMany({
          data: widgets.map((w) => ({
            dashboardId,
            type: w.type,
            title: w.title,
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
            config: (w.config ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            isVisible: w.isVisible ?? true,
          })),
        });
      }
      return tx.dashboardLayout.findUnique({
        where: { id: dashboardId },
        include: { widgets: { orderBy: [{ y: "asc" }, { x: "asc" }] } },
      });
    });
  }

  addWidget(dashboardId: string, w: UpsertWidgetInput) {
    return this.prisma.dashboardWidget.create({
      data: {
        dashboardId,
        type: w.type,
        title: w.title,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        config: (w.config ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        isVisible: w.isVisible ?? true,
      },
    });
  }

  updateWidget(widgetId: string, w: Partial<UpsertWidgetInput>) {
    return this.prisma.dashboardWidget.update({
      where: { id: widgetId },
      data: {
        type: w.type,
        title: w.title,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        config:
          w.config !== undefined
            ? ((w.config ?? Prisma.JsonNull) as Prisma.InputJsonValue)
            : undefined,
        isVisible: w.isVisible,
      },
    });
  }

  deleteWidget(widgetId: string) {
    return this.prisma.dashboardWidget.delete({ where: { id: widgetId } });
  }
}
