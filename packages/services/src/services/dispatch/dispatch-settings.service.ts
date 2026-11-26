import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ProviderDispatchSettingRepository } from "@ringee/database";
import {
  DispatchRuntime,
  ProviderDispatchService,
  accountSlot,
  applySettingsOverrides,
  calculateCpsSurcharge,
  derivedLimitsProblem,
  isDispatchSettingKey,
  validateSettingsPatch,
  type DispatchSettings,
} from "@ringee/platform";

/** The CPS Telnyx bills nothing for. Everything above it costs money. */
export const FREE_CPS = 5;

export interface SettingsChange {
  /** The staff member making the change. */
  userId: string | null;
  /** Why. Required for anything that raises exposure. */
  reason?: string | null;
  /** The administrator has read what a ceiling above the free CPS costs. */
  confirmCeilingIncrease?: boolean;
}

/**
 * The pacing limits an administrator can change at runtime (CPS-010), and the
 * one place a stored override is read back into the pacing layer.
 *
 * Overrides live in PostgreSQL, never only in Redis: a cache flush or a
 * failover can only ever bring back the environment's defaults, which are the
 * conservative ones. The pacing service caches what this gives it for two
 * seconds, so a change reaches every replica in about that time.
 */
@Injectable()
export class DispatchSettingsService implements OnModuleInit {
  private readonly logger = new Logger(DispatchSettingsService.name);

  constructor(
    private readonly dispatch: ProviderDispatchService,
    private readonly runtime: DispatchRuntime,
    private readonly repository: ProviderDispatchSettingRepository,
  ) {}

  onModuleInit(): void {
    this.runtime.setSettingsSource(() =>
      this.repository.listForAccount(this.accountKey()),
    );
  }

  private accountKey(): string {
    return accountSlot(this.dispatch.getAccount());
  }

  /** The effective settings, what is overridden, and the limits they give. */
  getState() {
    return this.dispatch.state();
  }

  /**
   * Changes settings. Anything that raises the ceiling above the free 5 CPS is
   * a spending decision, so it is refused until it is confirmed and explained,
   * and the refusal says what it can cost.
   *
   * "Raises" is judged against the ceiling that is stored, read under the
   * account's lock together with the write — never this replica's cached copy,
   * which can be two seconds old, and never a value another change is
   * replacing at the same moment.
   */
  async update(input: unknown, change: SettingsChange) {
    const { patch, errors } = validateSettingsPatch(input);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: "These settings were not changed.",
        errors,
      });
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException("There is nothing to change.");
    }

    const defaults = this.dispatch.getDefaultSettings();
    await this.repository.change(
      this.accountKey(),
      (stored) => {
        const current = applySettingsOverrides(defaults, stored);
        // Each value can be valid alone and the combination still pace
        // nothing (a share that rounds a level's capacity to zero).
        const problem = derivedLimitsProblem({
          ...current,
          ...patch,
        } as DispatchSettings);
        if (problem) {
          throw new BadRequestException({
            message: "These settings were not changed.",
            errors: [problem],
          });
        }
        if (
          patch.ceilingCps !== undefined &&
          patch.ceilingCps > FREE_CPS &&
          patch.ceilingCps > current.ceilingCps
        ) {
          this.assertCeilingIncreaseConfirmed(patch.ceilingCps, change);
        }
        return { upsert: patch };
      },
      { userId: change.userId, reason: change.reason?.trim() || null },
    );
    this.dispatch.invalidateSettings();
    this.logger.warn(
      `[cps-settings] changed by ${change.userId ?? "unknown"}: ${JSON.stringify(patch)}${
        change.reason ? ` (${change.reason.trim()})` : ""
      }`,
    );
    return this.getState();
  }

  /**
   * Removes overrides: those settings fall back to the environment. Judged
   * against the stored ceiling under the account's lock, as `update` is.
   */
  async reset(keys: string[], change: SettingsChange) {
    const known = keys.filter(isDispatchSettingKey);
    if (known.length === 0 || known.length !== keys.length) {
      throw new BadRequestException("Name the settings to reset.");
    }
    const defaults = this.dispatch.getDefaultSettings();
    const { removed } = await this.repository.change(
      this.accountKey(),
      (stored) => {
        const current = applySettingsOverrides(defaults, stored);
        if (
          known.includes("ceilingCps") &&
          defaults.ceilingCps > FREE_CPS &&
          defaults.ceilingCps > current.ceilingCps &&
          !isConfirmed(change)
        ) {
          throw new BadRequestException({
            code: "ceiling_increase_needs_confirmation",
            message:
              "Resetting to this environment's ceiling increases provider spending. Confirm the ceiling increase and give a reason of at least 10 characters.",
          });
        }
        return { remove: known };
      },
      { userId: change.userId, reason: change.reason?.trim() || null },
    );
    this.dispatch.invalidateSettings();
    this.logger.warn(
      `[cps-settings] reset by ${change.userId ?? "unknown"}: ${known.join(", ")} (${removed} removed)${
        change.reason ? ` — ${change.reason.trim()}` : ""
      }`,
    );
    return this.getState();
  }

  /** Refuses a ceiling above the free CPS unless it is confirmed and explained. */
  private assertCeilingIncreaseConfirmed(
    ceilingCps: number,
    change: SettingsChange,
  ): void {
    if (isConfirmed(change)) return;
    const exposure = calculateCpsSurcharge(ceilingCps);
    throw new BadRequestException({
      message:
        `Raising the ceiling to ${ceilingCps} CPS is a spending decision. ` +
        `Telnyx bills every CPS above ${FREE_CPS} each month: if the account's ` +
        `monthly 95th-percentile peak reached it, the surcharge at that peak would be ` +
        `$${exposure.totalUsd.toLocaleString("en-US")}. Send confirmCeilingIncrease: true ` +
        `and a reason of at least 10 characters to proceed.`,
      code: "ceiling_increase_needs_confirmation",
      exposureUsdPerMonth: exposure.totalUsd,
    });
  }
}

/** A ceiling increase confirmed and explained in at least ten characters. */
function isConfirmed(change: SettingsChange): boolean {
  return (
    change.confirmCeilingIncrease === true &&
    (change.reason?.trim().length ?? 0) >= 10
  );
}
