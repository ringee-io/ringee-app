import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRepository } from "@ringee/database";
import { OwnershipContext } from "@ringee/platform";
import { ContactListActor, ContactListService } from "./contact-lists";
import { CreditService } from "./credit.service";

export type OnboardingStep =
  | "first_call"
  | "recording"
  | "check_numbers"
  | "buy_credits";

export interface OnboardingStatusDto {
  completedSteps: OnboardingStep[];
  dismissedAt: Date | null;
  isComplete: boolean;
  totalSteps: number;
  progress: number;
}

/** The Call page's first-list onboarding, as `GET /onboarding/first-list` returns it. */
export interface FirstListOnboardingDto {
  /** The user has finished it in this workspace. */
  completed: boolean;
  /**
   * USD finishing it now would add: zero once done, once the workspace has a
   * list, while there is credit, and for an org member, who is not told the
   * organization's balance.
   */
  reward: number;
}

export interface FirstListCompletionDto {
  completed: true;
  /** USD this completion added to the workspace; zero when none was owed. */
  rewardGranted: number;
}

/**
 * The setup guide's checklist. Steps stored on the user that are not in it —
 * a retired `request_free_call`, the first-list onboarding — never count.
 */
const ALL_STEPS: OnboardingStep[] = [
  "first_call",
  "recording",
  "check_numbers",
  "buy_credits",
];

/** The gift for finishing the first-list onboarding (BILL-022). */
export const FIRST_LIST_REWARD_USD = 1;

/** Ledger `source` of onboarding gifts. Traceability only — never branched on. */
export const ONBOARDING_REWARD_SOURCE = "ONBOARDING_REWARD";

/** Whose gift it is: an organization's, or a person's own workspace. */
function workspaceOf(ctx: OwnershipContext): string {
  return ctx.organizationId
    ? `org:${ctx.organizationId}`
    : `user:${ctx.userId}`;
}

/**
 * The first-list onboarding is done once per workspace — the personal one,
 * and each organization — so it is stored per workspace on the user, beside
 * the guide's steps but never one of them. Only `completeFirstList` writes
 * it, once it has seen the list.
 */
function firstListStep(ctx: OwnershipContext): string {
  return ctx.organizationId ? `first_list:${ctx.organizationId}` : "first_list";
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly contactLists: ContactListService,
    private readonly credits: CreditService,
  ) {}

  /** One gift per workspace: an organization once, a person's own once. */
  static firstListRewardKey(ctx: OwnershipContext): string {
    return `onboarding:first-list:${workspaceOf(ctx)}`;
  }

  async getStatus(userId: string): Promise<OnboardingStatusDto> {
    const status = await this.userRepository.getOnboardingStatus(userId);

    if (!status) {
      throw new NotFoundException("User not found");
    }

    // Only the guide's own steps count towards its progress.
    const completedSteps = status.completedSteps.filter(
      (step): step is OnboardingStep =>
        ALL_STEPS.includes(step as OnboardingStep),
    );
    const totalSteps = ALL_STEPS.length;
    const isComplete = completedSteps.length >= totalSteps;
    const progress = Math.round((completedSteps.length / totalSteps) * 100);

    return {
      completedSteps,
      dismissedAt: status.dismissedAt,
      isComplete,
      totalSteps,
      progress,
    };
  }

  async completeStep(
    userId: string,
    step: OnboardingStep,
  ): Promise<OnboardingStatusDto> {
    if (!ALL_STEPS.includes(step)) {
      throw new NotFoundException(`Invalid step: ${step}`);
    }

    await this.userRepository.completeOnboardingStep(userId, step);
    return this.getStatus(userId);
  }

  async dismiss(userId: string): Promise<{ success: boolean }> {
    await this.userRepository.dismissOnboarding(userId);
    return { success: true };
  }

  async undismiss(userId: string): Promise<{ success: boolean }> {
    await this.userRepository.undismissOnboarding(userId);
    return { success: true };
  }

  /** Whether the user has made their first list here, and what it pays. */
  async getFirstList(actor: ContactListActor): Promise<FirstListOnboardingDto> {
    if (await this.hasCompletedFirstList(actor)) {
      return { completed: true, reward: 0 };
    }
    // A workspace that already has a list would only be making another one.
    const owed =
      (await this.contactLists.firstListInWorkspace(actor)) === null &&
      (await this.rewardOwed(actor));
    return { completed: false, reward: owed ? FIRST_LIST_REWARD_USD : 0 };
  }

  /**
   * Finishes the first-list onboarding with the list the user just made: one
   * they created for themselves, with somebody in it. The gift (BILL-022) is
   * for the workspace's first list only, once per workspace, for whoever
   * manages its balance and only while that balance is empty. Any later list
   * — at $0 or not — pays nothing, and neither does a member.
   *
   * The credit is granted before the step is stamped: a failure in between
   * leaves the gift paid and the stamp recoverable on retry, never two gifts —
   * the ledger key is the workspace's.
   */
  async completeFirstList(
    actor: ContactListActor,
    listId: string,
  ): Promise<FirstListCompletionDto> {
    // A list the actor may not see is a 404, like everywhere else (LIST-001).
    const list = await this.contactLists.get(actor, listId);
    if (
      list.createdBy.id !== actor.userId ||
      list.assignedTo?.id !== actor.userId
    ) {
      throw new BadRequestException(
        "Only a list you created for yourself completes this step",
      );
    }
    if (list.contactCount < 1) {
      throw new BadRequestException("Add somebody to call to the list first");
    }

    if (await this.hasCompletedFirstList(actor)) {
      return { completed: true, rewardGranted: 0 };
    }

    const firstList =
      (await this.contactLists.firstListInWorkspace(actor)) === list.id;
    let rewardGranted = 0;
    if (firstList && (await this.rewardOwed(actor))) {
      const { granted } = await this.credits.grantCreditsOnce(
        actor,
        FIRST_LIST_REWARD_USD,
        {
          idempotencyKey: OnboardingService.firstListRewardKey(actor),
          source: ONBOARDING_REWARD_SOURCE,
          metadata: { listId: list.id, userId: actor.userId },
        },
      );
      if (granted) rewardGranted = FIRST_LIST_REWARD_USD;
    }

    await this.userRepository.completeOnboardingStep(
      actor.userId,
      firstListStep(actor),
    );
    return { completed: true, rewardGranted };
  }

  /**
   * The gift goes to whoever manages the balance — a freelancer, an org
   * admin — and only while it is empty. A member's question never reads the
   * organization's balance (CALL-014).
   */
  private async rewardOwed(actor: ContactListActor): Promise<boolean> {
    if (actor.organizationId && !actor.isOrgAdmin) return false;
    return isEmptyBalance(await this.credits.getBalance(actor));
  }

  private async hasCompletedFirstList(
    actor: ContactListActor,
  ): Promise<boolean> {
    const status = await this.userRepository.getOnboardingStatus(actor.userId);
    if (!status) throw new NotFoundException("User not found");
    return status.completedSteps.includes(firstListStep(actor));
  }
}

/**
 * "At $0": nothing to call with, to the cent — rounding swallows the float
 * dust a run of debits leaves — and not in debt either.
 */
function isEmptyBalance(balance: number): boolean {
  return Math.round(balance * 100) === 0;
}
