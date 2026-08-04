import { resolveConfig, type RingeeAgentConfig } from "../config.js";
import {
  RingeeMcpClient,
  RingeeMcpError,
  type RingeeMcpClientOptions,
} from "./mcp-client.js";
import {
  CreateCallSessionSchema,
  CreateCallbackSchema,
  CreateContactSchema,
  DeleteCallSessionSchema,
  DeleteContactSchema,
  FindContactsByOutcomeSchema,
  GetCallSessionSchema,
  GetContactSchema,
  ImportLeadsSchema,
  ListCallsSchema,
  LogCallOutcomeSchema,
  RevealLeadSchema,
  ScheduleMeetingSchema,
  SearchContactsSchema,
  SearchLeadsSchema,
  UpdateCallSessionSchema,
  UpdateContactSchema,
  AddCampaignLeadsSchema,
  AddToDncSchema,
  DeleteCampaignLeadSchema,
  GetAiPipelineResultsSchema,
  GetCallAnalyticsSchema,
  GetCampaignAnalyticsSchema,
  GetCampaignSchema,
  GetDayActivitySchema,
  ListCallbacksSchema,
  ListCampaignLeadsSchema,
  ListCampaignsSchema,
  ListDncSchema,
  RemoveFromDncSchema,
  UpdateCampaignStatusSchema,
  type AddCampaignLeadsInput,
  type AddToDncInput,
  type DeleteCampaignLeadInput,
  type GetAiPipelineResultsInput,
  type GetCallAnalyticsInput,
  type GetCampaignAnalyticsInput,
  type GetCampaignInput,
  type GetDayActivityInput,
  type ListCallbacksInput,
  type ListCampaignLeadsInput,
  type ListCampaignsInput,
  type ListDncInput,
  type RemoveFromDncInput,
  type UpdateCampaignStatusInput,
  type CreateCallSessionInput,
  type CreateCallbackInput,
  type CreateContactInput,
  type DeleteCallSessionInput,
  type DeleteContactInput,
  type FindContactsByOutcomeInput,
  type GetCallSessionInput,
  type GetContactInput,
  type ImportLeadsInput,
  type ListCallsInput,
  type LogCallOutcomeInput,
  type RevealLeadInput,
  type ScheduleMeetingInput,
  type SearchContactsInput,
  type SearchLeadsInput,
  type UpdateCallSessionInput,
  type UpdateContactInput,
} from "../schemas/index.js";
import type {
  AddCampaignLeadsResult,
  AddToDncResult,
  AiPipelineResults,
  CallAnalyticsResult,
  CampaignAnalyticsResult,
  CampaignDetail,
  DayActivityResult,
  DeleteCampaignLeadResult,
  ListAiPipelinesResult,
  ListCallbacksResult,
  ListCampaignLeadsResult,
  ListCampaignsResult,
  ListDncResult,
  RemoveFromDncResult,
  UpdateCampaignStatusResult,
  CallSessionInfo,
  ContactDetail,
  CreateCallSessionResult,
  CreateCallbackResult,
  DeleteCallSessionResult,
  DeleteContactResult,
  FindContactsByOutcomeResult,
  ImportLeadsResult,
  ListCallsResult,
  LogCallOutcomeResult,
  MutateContactResult,
  RevealLeadResult,
  ScheduleMeetingResult,
  SearchContactsResult,
  SearchLeadsResult,
  UpdateCallSessionResult,
} from "../types/index.js";

/**
 * High-level, typed facade over the Ringee backend/MCP.
 *
 * Every method:
 *   1. validates input with the shared zod schema,
 *   2. forwards it to the real MCP tool (the source of truth), and
 *   3. returns the parsed, typed result.
 *
 * It contains no business rules — only validation and transport. Confirmation
 * gating for sensitive/destructive actions lives in the interfaces (CLI,
 * Skills, ChatGPT App) and is described in `../rules` and `../tools`.
 */
export class RingeeClient {
  readonly mcp: RingeeMcpClient;

  constructor(client: RingeeMcpClient);
  constructor(options: RingeeMcpClientOptions);
  constructor(arg: RingeeMcpClient | RingeeMcpClientOptions) {
    this.mcp = arg instanceof RingeeMcpClient ? arg : new RingeeMcpClient(arg);
  }

  /** Build a client from a resolved config object. */
  static fromConfig(config: RingeeAgentConfig): RingeeClient {
    return new RingeeClient({ url: config.mcpUrl, apiKey: config.apiKey });
  }

  /** Build a client from environment variables (see config.resolveConfig). */
  static fromEnv(
    env: Record<string, string | undefined> = process.env,
  ): RingeeClient {
    return RingeeClient.fromConfig(resolveConfig(env));
  }

  connect(): Promise<void> {
    return this.mcp.connect();
  }

  close(): Promise<void> {
    return this.mcp.close();
  }

  private async call<T>(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.mcp.callTool(tool, args);
    if (res.isError) {
      const message =
        typeof res.data === "object" && res.data && "error" in res.data
          ? String((res.data as { error: unknown }).error)
          : res.rawText || `MCP tool ${tool} returned an error`;
      throw new RingeeMcpError(message, tool, res.data);
    }
    return res.data as T;
  }

  // ── Contacts ────────────────────────────────────────────────────────

  searchContacts(input: SearchContactsInput): Promise<SearchContactsResult> {
    return this.call("search_contacts", SearchContactsSchema.parse(input));
  }

  getContact(input: GetContactInput): Promise<ContactDetail> {
    return this.call("get_contact", GetContactSchema.parse(input));
  }

  /** Find contacts by call outcome — ICP learning. Read-only, no credits. */
  findContactsByOutcome(
    input: FindContactsByOutcomeInput,
  ): Promise<FindContactsByOutcomeResult> {
    return this.call(
      "find_contacts_by_outcome",
      FindContactsByOutcomeSchema.parse(input),
    );
  }

  createContact(input: CreateContactInput): Promise<MutateContactResult> {
    return this.call("create_contact", CreateContactSchema.parse(input));
  }

  updateContact(input: UpdateContactInput): Promise<MutateContactResult> {
    return this.call("update_contact", UpdateContactSchema.parse(input));
  }

  /** DESTRUCTIVE. Requires confirm=true and a matching confirmPhoneNumber. */
  deleteContact(input: DeleteContactInput): Promise<DeleteContactResult> {
    return this.call("delete_contact", DeleteContactSchema.parse(input));
  }

  // ── Call activity ───────────────────────────────────────────────────

  /** List calls with full detail (transcription + recording URL). Read-only. */
  listCalls(input: ListCallsInput = {}): Promise<ListCallsResult> {
    return this.call("list_calls", ListCallsSchema.parse(input));
  }

  logCallOutcome(input: LogCallOutcomeInput): Promise<LogCallOutcomeResult> {
    return this.call("log_call_outcome", LogCallOutcomeSchema.parse(input));
  }

  createCallback(input: CreateCallbackInput): Promise<CreateCallbackResult> {
    return this.call("create_callback", CreateCallbackSchema.parse(input));
  }

  scheduleMeeting(input: ScheduleMeetingInput): Promise<ScheduleMeetingResult> {
    return this.call("schedule_meeting", ScheduleMeetingSchema.parse(input));
  }

  // ── Call sessions (magic-link dialing) ──────────────────────────────

  /** SENSITIVE. Mints a shareable magic link. Confirm intent first. */
  createCallSession(
    input: CreateCallSessionInput,
  ): Promise<CreateCallSessionResult> {
    return this.call(
      "create_call_session",
      CreateCallSessionSchema.parse(input),
    );
  }

  updateCallSession(
    input: UpdateCallSessionInput,
  ): Promise<UpdateCallSessionResult> {
    return this.call(
      "update_call_session",
      UpdateCallSessionSchema.parse(input),
    );
  }

  getCallSession(input: GetCallSessionInput): Promise<CallSessionInfo> {
    return this.call("get_call_session", GetCallSessionSchema.parse(input));
  }

  /** DESTRUCTIVE. Revokes the magic link immediately. Confirm first. */
  deleteCallSession(
    input: DeleteCallSessionInput,
  ): Promise<DeleteCallSessionResult> {
    return this.call(
      "delete_call_session",
      DeleteCallSessionSchema.parse(input),
    );
  }

  // ── Lead prospecting (Apollo / Prospeo) ─────────────────────────────

  searchLeads(input: SearchLeadsInput): Promise<SearchLeadsResult> {
    return this.call("search_leads", SearchLeadsSchema.parse(input));
  }

  /** SENSITIVE. Spends provider credits. Confirm intent first. */
  revealLead(input: RevealLeadInput): Promise<RevealLeadResult> {
    return this.call("reveal_lead", RevealLeadSchema.parse(input));
  }

  importLeadsAsContacts(input: ImportLeadsInput): Promise<ImportLeadsResult> {
    return this.call(
      "import_leads_as_contacts",
      ImportLeadsSchema.parse(input),
    );
  }

  // ── Campaigns (organization workspaces only) ────────────────────────

  listCampaigns(input: ListCampaignsInput = {}): Promise<ListCampaignsResult> {
    return this.call("list_campaigns", ListCampaignsSchema.parse(input));
  }

  getCampaign(input: GetCampaignInput): Promise<CampaignDetail> {
    return this.call("get_campaign", GetCampaignSchema.parse(input));
  }

  /** Organization admins only. Invalid transitions are rejected server-side. */
  updateCampaignStatus(
    input: UpdateCampaignStatusInput,
  ): Promise<UpdateCampaignStatusResult> {
    return this.call(
      "update_campaign_status",
      UpdateCampaignStatusSchema.parse(input),
    );
  }

  listCampaignLeads(
    input: ListCampaignLeadsInput,
  ): Promise<ListCampaignLeadsResult> {
    return this.call(
      "list_campaign_leads",
      ListCampaignLeadsSchema.parse(input),
    );
  }

  /** Organization admins only. Existing contacts are reused, never duplicated. */
  addCampaignLeads(
    input: AddCampaignLeadsInput,
  ): Promise<AddCampaignLeadsResult> {
    return this.call("add_campaign_leads", AddCampaignLeadsSchema.parse(input));
  }

  /** DESTRUCTIVE. Requires confirm=true. Drops the lead's attempts/callbacks. */
  deleteCampaignLead(
    input: DeleteCampaignLeadInput,
  ): Promise<DeleteCampaignLeadResult> {
    return this.call(
      "delete_campaign_lead",
      DeleteCampaignLeadSchema.parse(input),
    );
  }

  getCampaignAnalytics(
    input: GetCampaignAnalyticsInput,
  ): Promise<CampaignAnalyticsResult> {
    return this.call(
      "get_campaign_analytics",
      GetCampaignAnalyticsSchema.parse(input),
    );
  }

  // ── Analytics + activity ────────────────────────────────────────────

  /** The dashboard overview numbers. campaignId="none" = outside campaigns. */
  getCallAnalytics(
    input: GetCallAnalyticsInput = {},
  ): Promise<CallAnalyticsResult> {
    return this.call("get_call_analytics", GetCallAnalyticsSchema.parse(input));
  }

  getDayActivity(input: GetDayActivityInput): Promise<DayActivityResult> {
    return this.call("get_day_activity", GetDayActivitySchema.parse(input));
  }

  listCallbacks(input: ListCallbacksInput = {}): Promise<ListCallbacksResult> {
    return this.call("list_callbacks", ListCallbacksSchema.parse(input));
  }

  // ── DNC (do-not-call suppression) ───────────────────────────────────

  listDnc(input: ListDncInput = {}): Promise<ListDncResult> {
    return this.call("list_dnc", ListDncSchema.parse(input));
  }

  addToDnc(input: AddToDncInput): Promise<AddToDncResult> {
    return this.call("add_to_dnc", AddToDncSchema.parse(input));
  }

  /** DESTRUCTIVE for compliance. Requires confirm=true. */
  removeFromDnc(input: RemoveFromDncInput): Promise<RemoveFromDncResult> {
    return this.call("remove_from_dnc", RemoveFromDncSchema.parse(input));
  }

  // ── AI pipelines ────────────────────────────────────────────────────

  listAiPipelines(): Promise<ListAiPipelinesResult> {
    return this.call("list_ai_pipelines", {});
  }

  getAiPipelineResults(
    input: GetAiPipelineResultsInput,
  ): Promise<AiPipelineResults> {
    return this.call(
      "get_ai_pipeline_results",
      GetAiPipelineResultsSchema.parse(input),
    );
  }
}
