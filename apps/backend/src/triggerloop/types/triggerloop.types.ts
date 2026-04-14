export const TRIGGERLOOP_WEBHOOK_OPERATIONS = ["evaluate", "executeAction"] as const;
export type TriggerLoopOperation = (typeof TRIGGERLOOP_WEBHOOK_OPERATIONS)[number];

export const TRIGGERLOOP_SUBJECT_TYPES = ["user", "organization"] as const;
export type TriggerLoopSubjectType = (typeof TRIGGERLOOP_SUBJECT_TYPES)[number];

export const TRIGGERLOOP_ACTION_TYPES = [
  "email",
  "notification",
  "task",
  "internalEvent",
] as const;
export type TriggerLoopActionType = (typeof TRIGGERLOOP_ACTION_TYPES)[number];

export const TRIGGERLOOP_WORKFLOW_KEYS = [
  "signupFollowup",
  "reactivationFollowup",
  "firstCallFollowup",
  "creditsFollowup",
  "numberPurchaseFollowup",
  "contactsImportFollowup",
  "campaignsCallbacksAdoptionFollowup",
  "teamSetupFollowup",
] as const;
export type TriggerLoopWorkflowKey = (typeof TRIGGERLOOP_WORKFLOW_KEYS)[number];

export interface TriggerLoopSubject {
  type: TriggerLoopSubjectType;
  id: string;
}

export interface TriggerLoopWorkflowState {
  currentStepKey: string | null;
  sentStepKeys: string[];
  sentActionKeys: string[];
  executionCount: number;
}

export interface TriggerLoopAction<TPayload = Record<string, unknown>> {
  type: TriggerLoopActionType;
  actionKey: string;
  allowRepeat: boolean;
  payload: TPayload;
}

export interface TriggerLoopEvaluateResult {
  stepKey: string | null;
  close: boolean;
  nextDelayMs: number | null;
  actions: TriggerLoopAction[];
}

export interface TriggerLoopExecuteActionResult {
  success: boolean;
  externalReference?: string;
  error?: string;
}

export interface UserBusinessSignals {
  userId: string;
  organizationId: string | null;
  email: string | null;
  isTeamAccount: boolean;
  registered: boolean;
  emailVerified: boolean;
  workspaceCreated: boolean;
  phoneNumberAssigned: boolean;
  creditsAdded: boolean;
  contactsImported: boolean;
  firstCallCompleted: boolean;
  firstCallCompletedAt: Date | null;
  lastActivityAt: Date | null;
  active: boolean;
  hasCampaign: boolean;
  hasCallbacks: boolean;
  hasDncEntries: boolean;
  teamMembersCount: number;
}

export const TRIGGERLOOP_EVENT_NAMES = [
  "user.registered",
  "user.emailVerified",
  "workspace.created",
  "credits.added",
  "phoneNumber.assigned",
  "contacts.imported",
  "call.firstCompleted",
  "user.becameActive",
  "user.inactive",
] as const;
export type TriggerLoopEventName = (typeof TRIGGERLOOP_EVENT_NAMES)[number];
