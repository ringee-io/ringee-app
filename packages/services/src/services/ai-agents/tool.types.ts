import type { AiAgentType, AiConversation } from "@ringee/database";
import type { OwnershipContext } from "@ringee/platform";

/**
 * Runtime context handed to every internal tool. Tools must never
 * trust arguments to identify the user/org — that comes from here.
 */
export interface AgentToolContext {
  ctx: OwnershipContext;
  conversation: AiConversation;
  agent: AiAgentType;
  /** Emit a structured event back to the chat orchestrator (and via SSE to the UI). */
  emit(event: AgentToolEvent): Promise<void> | void;
}

export type AgentToolEvent =
  | {
      kind: "tool_progress";
      toolName: string;
      message: string;
    }
  | {
      kind: "prospect_results";
      jobId: string;
      provider: string;
      results: ProspectPreview[];
      filtersSummary: string;
    }
  | {
      kind: "confirmation_request";
      requestId: string;
      action: "reveal" | "save" | "list_create";
      payload: Record<string, unknown>;
      summary: string;
      estimatedCreditCost?: number | null;
    }
  | {
      kind: "prospects_saved";
      contactIds: string[];
      duplicates: number;
      errors: number;
    }
  | {
      kind: "list_created";
      tagId: string;
      tagName: string;
      contactCount: number;
    };

export interface ProspectWorkHistoryEntry {
  company: string | null;
  title: string | null;
  current: boolean | null;
}

export interface ProspectEducationEntry {
  school: string | null;
  degree: string | null;
  field: string | null;
}

/** Normalized person data for the prospect detail modal (no contact values). */
export interface ProspectPersonDetails {
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  summary: string | null;
  jobTitle: string | null;
  seniority: string | null;
  department: string | null;
  yearsExperience: number | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  githubUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  languages: string[];
  skills: string[];
  emailCount: number;
  verifiedEmailCount: number;
  phoneCount: number;
  workHistory: ProspectWorkHistoryEntry[];
  education: ProspectEducationEntry[];
}

/** Normalized company data for the prospect detail modal. */
export interface ProspectCompanyDetails {
  name: string | null;
  legalName: string | null;
  domain: string | null;
  website: string | null;
  description: string | null;
  industry: string | null;
  subIndustry: string | null;
  size: string | null;
  employeeCount: number | null;
  employeeCountRange: string | null;
  revenueRange: string | null;
  fundingStage: string | null;
  foundedYear: number | null;
  companyType: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  location: string | null;
  technologies: string[];
  keywords: string[];
}

export interface ProspectDetails {
  person: ProspectPersonDetails;
  company: ProspectCompanyDetails | null;
}

export interface ProspectPreview {
  externalId: string;
  jobId: string;
  provider: string;
  fullName: string | null;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  fitScore: number;
  confidence: number | null;
  reasons: string[];
  /** Public LinkedIn profile URL, when the provider returned one. */
  linkedinUrl: string | null;
  /** Full normalized provider data for the detail modal — no contact values. */
  details: ProspectDetails;
}

/**
 * An internal tool the LLM can call. Tools do not know which provider is
 * underneath — they ask the supporting services. Tools are JSON-in/JSON-out.
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: any, runtime: AgentToolContext): Promise<unknown>;
}
