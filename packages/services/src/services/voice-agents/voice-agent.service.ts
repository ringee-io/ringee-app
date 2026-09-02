import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgent,
  AiVoiceAgentRepository,
  AiVoiceAgentStatus,
  AiVoiceAgentType,
  CalendarIntegrationRepository,
  NumberKind,
  OutboundSource,
  type AiVoiceAgentWithSources,
} from "@ringee/database";
import {
  describeTelnyxError,
  hashApiKey,
  LlmCredentialVerifier,
  resolveVoiceAgentModel,
  voiceAgentInsightsToken,
  VoiceAgentProviderService,
  type OwnershipContext,
  type VoiceAgentConfig,
  type VoiceAgentLlmProvider,
  type VoiceAgentVoice,
} from "@ringee/platform";
import { NumberPurchasedService } from "../number.purchased.service";
import { VoiceAgentBlueprintRegistry } from "./blueprints/voice-agent-blueprint.registry";
import { CompanyProfileService } from "./company-profile.service";
import {
  composeVoiceAgentInstructions,
  readVoiceAgentConversationSettings,
} from "./voice-agent-conversation";
import {
  DEFAULT_ANALYSIS_SETTINGS,
  voiceAgentKnowledgeStoreName,
  type VoiceAgentAnalysisSettings,
  type VoiceAgentBlueprintInsights,
  type VoiceAgentConversationSettings,
  type VoiceAgentExtractionField,
  type VoiceAgentPromptContext,
} from "./voice-agent.types";

/** How long the curated voice list is reused before refetching. */
const VOICE_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * What a voice says in its preview. One line per language Ringee curates, so a
 * user hears the voice speaking the language the agent will actually use rather
 * than an English sample with a foreign accent.
 */
const VOICE_PREVIEW_SAMPLES: Record<string, string> = {
  en: "Hi, this is Alex. I'm calling about your appointment tomorrow — does ten in the morning still work for you?",
  es: "Hola, le llamo por su cita de mañana. ¿Le sigue viniendo bien a las diez de la mañana?",
  pt: "Olá, estou ligando por causa do seu agendamento de amanhã. As dez da manhã ainda funciona para você?",
  fr: "Bonjour, je vous appelle au sujet de votre rendez-vous de demain. Dix heures du matin vous convient toujours ?",
  de: "Hallo, ich rufe wegen Ihres Termins morgen an. Passt Ihnen zehn Uhr morgens immer noch?",
  it: "Salve, la chiamo per il suo appuntamento di domani. Le dieci di mattina va ancora bene?",
};

/**
 * Previews are the same few seconds of audio every time, and the provider bills
 * per render, so a rendered sample is kept for the process's lifetime. The
 * catalogue is capped per locale, which bounds this map to the size of the
 * picker.
 */
const VOICE_PREVIEW_CACHE_LIMIT = 200;

export interface SaveVoiceAgentInput {
  name?: string;
  modelProvider?: VoiceAgentLlmProvider;
  /** Present only when the user is setting or replacing a credential. */
  apiKey?: string;
  voiceId?: string | null;
  /** Company context this agent speaks for; see `CompanyProfileService`. */
  companyName?: string | null;
  companyWebsite?: string | null;
  companyDescription?: string | null;
  analysis?: Partial<
    Pick<VoiceAgentAnalysisSettings, "summary" | "outcome" | "sentiment">
  >;
  extractionFields?: VoiceAgentExtractionField[];
  /** Editable prompt, greeting and post-conversation behaviour. */
  conversation?: VoiceAgentConversationSettings;
  /**
   * The number the agent presents. `null` clears the assignment, which puts the
   * choice back on whoever triggers the call.
   */
  callerNumberId?: string | null;
  calendarIntegrationId?: string | null;
  meetingDurationMinutes?: number;
  timezone?: string | null;
  meetingTitle?: string | null;
}

/** A rendered voice sample, inlined so the browser can play it as a data URL. */
export interface VoiceAgentVoicePreview {
  voiceId: string;
  /** What the sample says, shown under the player. */
  text: string;
  contentType: string;
  audioBase64: string;
}

/**
 * A number this workspace may present on an AI agent call. The shape the picker
 * needs and nothing more — the eligibility rule itself stays in
 * `NumberPurchasedService.listOutboundCallerIds`.
 */
export interface VoiceAgentCallerNumber {
  id: string;
  phoneNumber: string;
  isoCountry: string;
  kind: NumberKind;
}

/** An agent as the list screen shows it: the row plus its call count. */
export interface VoiceAgentListItem extends AiVoiceAgent {
  callCount: number;
}

export interface VoiceAgentListPage {
  data: VoiceAgentListItem[];
  total: number;
  page: number;
  limit: number;
}

/** Detail response with nullable stored overrides resolved to blueprint values. */
export type VoiceAgentDetail = Omit<
  AiVoiceAgentWithSources,
  "conversationSettings"
> & {
  conversationSettings: VoiceAgentConversationSettings;
};

export interface CreateVoiceAgentInput extends SaveVoiceAgentInput {
  name: string;
  type: AiVoiceAgentType;
}

/**
 * Agent lifecycle: what the user configures, and everything Ringee configures
 * on their behalf.
 *
 * The provider assistant is a projection of the database row — the row is the
 * source of truth, and every save re-derives the assistant from the blueprint,
 * workspace context and user-editable conversation settings. Tools, variable
 * schemas and safety constraints remain owned by the blueprint.
 */
@Injectable()
export class VoiceAgentService {
  private readonly logger = new Logger(VoiceAgentService.name);
  private voiceCache: { voices: VoiceAgentVoice[]; fetchedAt: number } | null =
    null;
  private readonly voicePreviews = new Map<string, VoiceAgentVoicePreview>();

  constructor(
    private readonly agents: AiVoiceAgentRepository,
    private readonly blueprints: VoiceAgentBlueprintRegistry,
    private readonly companyProfiles: CompanyProfileService,
    private readonly provider: VoiceAgentProviderService,
    private readonly credentials: LlmCredentialVerifier,
    private readonly calendars: CalendarIntegrationRepository,
    private readonly numbers: NumberPurchasedService,
  ) {}

  // ── Catalogue ────────────────────────────────────────────────

  /** The agent types offered on the create screen, with their variables. */
  listTypes() {
    return this.blueprints.all().map((blueprint) => ({
      type: blueprint.type,
      title: blueprint.title,
      summary: blueprint.summary,
      requiresCalendar: blueprint.requiresCalendar,
      variables: blueprint.variables,
      outcomes: blueprint.outcomes,
    }));
  }

  async listVoices(): Promise<VoiceAgentVoice[]> {
    const now = Date.now();
    if (
      this.voiceCache &&
      now - this.voiceCache.fetchedAt < VOICE_CACHE_TTL_MS
    ) {
      return this.voiceCache.voices;
    }
    const voices = await this.provider.listVoices();
    this.voiceCache = { voices, fetchedAt: now };
    return voices;
  }

  /**
   * A short sample of a voice, so the user hears it before choosing it rather
   * than after the first real call. Only curated voices can be previewed — the
   * id comes from the picker, and an id that is not in the catalogue is not a
   * voice this workspace may ever select.
   */
  async previewVoice(voiceId: string): Promise<VoiceAgentVoicePreview> {
    const cached = this.voicePreviews.get(voiceId);
    if (cached) return cached;

    const voice = await this.resolveVoice(voiceId);
    if (!voice) throw new BadRequestException("That voice is not available.");

    const text =
      VOICE_PREVIEW_SAMPLES[voice.language] ?? VOICE_PREVIEW_SAMPLES.en!;
    const { audio, contentType } = await this.provider.renderVoicePreview(
      voice.id,
      text,
    );

    const preview: VoiceAgentVoicePreview = {
      voiceId: voice.id,
      text,
      contentType,
      audioBase64: audio.toString("base64"),
    };
    if (this.voicePreviews.size >= VOICE_PREVIEW_CACHE_LIMIT) {
      this.voicePreviews.clear();
    }
    this.voicePreviews.set(voiceId, preview);
    return preview;
  }

  // ── Reads ────────────────────────────────────────────────────

  async list(
    ctx: OwnershipContext,
    options?: { page?: number; limit?: number; type?: AiVoiceAgentType },
  ): Promise<VoiceAgentListPage> {
    const page = await this.agents.listForOwner(ctx, options);
    const counts = await this.agents.countCallsByAgent(
      page.data.map((agent) => agent.id),
    );
    return {
      ...page,
      data: page.data.map((agent) => ({
        ...agent,
        callCount: counts.get(agent.id) ?? 0,
      })),
    };
  }

  /**
   * The numbers an agent in this workspace may call from. Used by the agent
   * form to assign one, and by every trigger surface to offer the choice when
   * the agent carries no assignment.
   */
  async listCallerNumbers(
    ctx: OwnershipContext,
  ): Promise<VoiceAgentCallerNumber[]> {
    const numbers = await this.numbers.listOutboundCallerIds(ctx, {
      source: OutboundSource.ai_voice_agent,
      userId: ctx.userId,
    });
    return numbers.map((number) => ({
      id: number.id,
      phoneNumber: number.phoneNumber,
      isoCountry: number.isoCountry,
      kind: number.kind,
    }));
  }

  async require(
    ctx: OwnershipContext,
    id: string,
  ): Promise<AiVoiceAgentWithSources> {
    const agent = await this.agents.findByIdForOwner(ctx, id);
    if (!agent) throw new NotFoundException("AI voice agent not found");
    return agent;
  }

  /**
   * The editable detail surface needs concrete values, including for agents
   * created before conversation overrides existed. Null in the database means
   * "follow the current blueprint", not an empty form.
   */
  async detail(ctx: OwnershipContext, id: string): Promise<VoiceAgentDetail> {
    const agent = await this.require(ctx, id);
    const { defaults } = await this.resolveConversation(ctx, agent);
    return {
      ...agent,
      conversationSettings: readVoiceAgentConversationSettings(
        agent.conversationSettings,
        defaults,
      ),
    };
  }

  // ── Writes ───────────────────────────────────────────────────

  async create(
    ctx: OwnershipContext,
    dto: CreateVoiceAgentInput,
  ): Promise<AiVoiceAgent> {
    const blueprint = this.blueprints.require(dto.type);
    const name = this.requireName(dto.name);
    const modelProvider = dto.modelProvider ?? "ringee";

    // The credential is verified before anything is created, so a bad key
    // fails while the user is still looking at the form.
    const apiKeyRef = await this.provisionCredential(modelProvider, dto.apiKey);

    if (dto.calendarIntegrationId) {
      await this.assertCalendarInWorkspace(ctx, dto.calendarIntegrationId);
    }
    if (dto.callerNumberId) {
      await this.assertCallerNumberUsable(ctx, dto.callerNumberId);
    }

    const voice = await this.resolveVoice(dto.voiceId);

    const toolSecret = this.generateToolSecret();
    const agent = await this.agents.create(ctx, {
      name,
      type: blueprint.type,
      status: AiVoiceAgentStatus.draft,
      modelProvider,
      llmApiKeyRef: apiKeyRef,
      voiceId: voice?.id ?? null,
      voiceLabel: voice?.displayName ?? null,
      voiceLanguage: voice?.language ?? null,
      companyName: dto.companyName?.trim() || null,
      companyWebsite: dto.companyWebsite?.trim() || null,
      companyDescription: dto.companyDescription?.trim() || null,
      analysisSettings: this.mergeAnalysis(null, dto.analysis) as object,
      extractionFields: (dto.extractionFields ?? []) as object,
      conversationSettings: dto.conversation
        ? (this.validateConversationSettings(dto.conversation) as object)
        : undefined,
      callerNumberId: dto.callerNumberId ?? null,
      calendarIntegrationId: dto.calendarIntegrationId ?? null,
      meetingDurationMinutes: dto.meetingDurationMinutes ?? 30,
      timezone: dto.timezone ?? null,
      meetingTitle: dto.meetingTitle ?? null,
      toolSecretHash: hashApiKey(toolSecret),
    });

    return this.syncToProvider(ctx, agent.id, { toolSecret });
  }

  async update(
    ctx: OwnershipContext,
    id: string,
    dto: SaveVoiceAgentInput,
  ): Promise<AiVoiceAgent> {
    const agent = await this.require(ctx, id);

    const apiKeyRef =
      dto.modelProvider && dto.modelProvider !== agent.modelProvider
        ? await this.provisionCredential(dto.modelProvider, dto.apiKey, agent)
        : dto.apiKey
          ? await this.provisionCredential(
              (dto.modelProvider ??
                agent.modelProvider) as VoiceAgentLlmProvider,
              dto.apiKey,
              agent,
            )
          : agent.llmApiKeyRef;

    if (dto.calendarIntegrationId) {
      await this.assertCalendarInWorkspace(ctx, dto.calendarIntegrationId);
    }
    // Only a *changed* assignment is validated. Re-saving an agent whose number
    // has since been released would otherwise fail on a field the user did not
    // touch — activation and dial time both re-check it anyway.
    if (dto.callerNumberId && dto.callerNumberId !== agent.callerNumberId) {
      await this.assertCallerNumberUsable(ctx, dto.callerNumberId);
    }

    const voice =
      dto.voiceId === undefined
        ? undefined
        : await this.resolveVoice(dto.voiceId);

    await this.agents.update(id, {
      ...(dto.name !== undefined ? { name: this.requireName(dto.name) } : {}),
      ...(dto.modelProvider ? { modelProvider: dto.modelProvider } : {}),
      llmApiKeyRef: apiKeyRef,
      ...(dto.voiceId !== undefined
        ? {
            voiceId: voice?.id ?? null,
            voiceLabel: voice?.displayName ?? null,
            voiceLanguage: voice?.language ?? null,
          }
        : {}),
      ...(dto.companyName !== undefined
        ? { companyName: dto.companyName?.trim() || null }
        : {}),
      ...(dto.companyWebsite !== undefined
        ? { companyWebsite: dto.companyWebsite?.trim() || null }
        : {}),
      ...(dto.companyDescription !== undefined
        ? { companyDescription: dto.companyDescription?.trim() || null }
        : {}),
      ...(dto.analysis
        ? {
            analysisSettings: this.mergeAnalysis(
              this.readAnalysis(agent),
              dto.analysis,
            ) as object,
          }
        : {}),
      ...(dto.extractionFields
        ? { extractionFields: dto.extractionFields as object }
        : {}),
      ...(dto.conversation
        ? {
            conversationSettings: this.validateConversationSettings(
              dto.conversation,
            ) as object,
          }
        : {}),
      ...(dto.callerNumberId !== undefined
        ? { callerNumberId: dto.callerNumberId }
        : {}),
      ...(dto.calendarIntegrationId !== undefined
        ? { calendarIntegrationId: dto.calendarIntegrationId }
        : {}),
      ...(dto.meetingDurationMinutes !== undefined
        ? { meetingDurationMinutes: dto.meetingDurationMinutes }
        : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.meetingTitle !== undefined
        ? { meetingTitle: dto.meetingTitle }
        : {}),
    });

    return this.syncToProvider(ctx, id);
  }

  /**
   * Rebuilds the provider-side agent from the stored row. Callers that change
   * something the assistant is derived from — knowledge finishing its indexing,
   * the workspace company context being edited — use this instead of reaching
   * into the sync themselves.
   */
  resync(ctx: OwnershipContext, agentId: string): Promise<AiVoiceAgent> {
    return this.syncToProvider(ctx, agentId);
  }

  /**
   * Deleting removes the provider-side resources first, then soft-deletes the
   * row. An orphaned assistant would keep answering calls, and an orphaned
   * secret would keep the customer's credential alive at the provider.
   */
  async delete(ctx: OwnershipContext, id: string): Promise<void> {
    const agent = await this.require(ctx, id);

    if (agent.providerAssistantId) {
      await this.provider.deleteAssistant(agent.providerAssistantId);
    }
    if (agent.providerInsightGroupId) {
      await this.provider.deleteInsightGroup(agent.providerInsightGroupId);
    }
    if (agent.llmApiKeyRef) {
      await this.provider.deleteSecret(agent.llmApiKeyRef);
    }
    await this.provider.deleteSecret(this.toolSecretIdentifier(agent.id));
    await this.provider
      .deleteKnowledgeStore(voiceAgentKnowledgeStoreName(agent.id))
      .catch((error: unknown) => {
        // A stranded store costs storage but must not block the deletion the
        // user asked for.
        this.logger.warn(
          `Could not delete the knowledge store for agent ${agent.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    await this.agents.softDelete(id);
  }

  async setStatus(
    ctx: OwnershipContext,
    id: string,
    status: Extract<AiVoiceAgentStatus, "active" | "disabled">,
  ): Promise<AiVoiceAgent> {
    const agent = await this.require(ctx, id);
    if (status === AiVoiceAgentStatus.active) {
      this.assertReadyForCalls(agent);
      await this.assertCallerNumberReady(ctx, agent);
    }
    return this.agents.update(id, { status });
  }

  /**
   * Everything that must be true before an agent may place a call. Called both
   * when the user activates the agent and again at dial time, because an
   * integration can be disconnected after activation.
   */
  assertReadyForCalls(agent: AiVoiceAgent): void {
    const blueprint = this.blueprints.require(agent.type);
    if (!agent.providerAssistantId) {
      throw new BadRequestException(
        "This agent is not finished setting up yet. Save it again to retry.",
      );
    }
    if (blueprint.requiresCalendar && !agent.calendarIntegrationId) {
      throw new BadRequestException(
        "Connect a calendar before this agent can book meetings.",
      );
    }
    if (agent.modelProvider !== "ringee" && !agent.llmApiKeyRef) {
      throw new BadRequestException(
        "Add and verify an API key for the selected AI provider.",
      );
    }
  }

  // ── Credentials ──────────────────────────────────────────────

  /**
   * Verifies a bring-your-own key and hands it to the voice provider, which
   * stores it. Ringee keeps only the reference — the key itself is never
   * written to our database and never leaves this method.
   */
  async verifyCredential(
    provider: VoiceAgentLlmProvider,
    apiKey: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    return this.credentials.verify(provider, apiKey);
  }

  private async provisionCredential(
    modelProvider: VoiceAgentLlmProvider,
    apiKey: string | undefined,
    existing?: AiVoiceAgent,
  ): Promise<string | null> {
    if (modelProvider === "ringee") {
      // Switching back to Ringee AI retires the customer's stored credential.
      if (existing?.llmApiKeyRef) {
        await this.provider.deleteSecret(existing.llmApiKeyRef);
      }
      return null;
    }

    if (!apiKey) {
      if (existing?.llmApiKeyRef && existing.modelProvider === modelProvider) {
        return existing.llmApiKeyRef;
      }
      throw new BadRequestException(
        "An API key is required for the selected AI provider.",
      );
    }

    const check = await this.credentials.verify(modelProvider, apiKey);
    if (!check.valid) {
      throw new BadRequestException(
        check.reason ?? "The API key is not valid.",
      );
    }

    const identifier = `ringee-voice-agent-llm-${randomBytes(8).toString("hex")}`;
    await this.provider.storeSecret(identifier, apiKey);
    if (existing?.llmApiKeyRef) {
      await this.provider.deleteSecret(existing.llmApiKeyRef);
    }
    return identifier;
  }

  // ── Provider synchronisation ─────────────────────────────────

  /**
   * Re-derives the whole provider-side agent from the stored row. Runs on every
   * save so the assistant can never drift from what the user configured.
   *
   * A provider failure is recorded on the row rather than thrown away: the
   * agent lands in `error` with the reason, and saving again retries.
   */
  private async syncToProvider(
    ctx: OwnershipContext,
    agentId: string,
    options?: { toolSecret?: string },
  ): Promise<AiVoiceAgent> {
    const agent = await this.require(ctx, agentId);
    const blueprint = this.blueprints.require(agent.type);

    try {
      const toolSecret = options?.toolSecret;
      if (toolSecret) {
        await this.provider.storeSecret(
          this.toolSecretIdentifier(agent.id),
          toolSecret,
        );
      }

      // Provider-side identifiers are written the moment they exist, not once
      // at the end. Everything below here can fail, and the catch only records
      // the error — so an id held in a local until then is an insight group or
      // an insight left running on the provider that nothing owns: the next
      // save creates a second set, and `delete` cannot clean up what the row
      // never learned about.
      const insightGroup = {
        name: `Ringee agent ${agent.id}`,
        webhookUrl: this.insightsCallbackUrl(agent.id),
      };
      let insightGroupId = agent.providerInsightGroupId;
      if (!insightGroupId) {
        insightGroupId = await this.provider.createInsightGroup(insightGroup);
        await this.agents.update(agent.id, {
          providerInsightGroupId: insightGroupId,
        });
      } else {
        // On every save, not only at creation. The provider analyses each
        // finished conversation and posts the result to the group's webhook —
        // there is no endpoint to read it back — so a group created before
        // Ringee had a callback to give it analyses every call this agent
        // makes and delivers the results nowhere. Re-pointing it here is the
        // only thing that ever fixes those agents.
        await this.provider.updateInsightGroup(insightGroupId, insightGroup);
      }

      const insightIds = await this.syncInsights(agent, insightGroupId);
      const analysisAfterSync = {
        ...this.readAnalysis(agent),
        insightIds,
      } as object;
      await this.agents.update(agent.id, {
        analysisSettings: analysisAfterSync,
      });

      const config = await this.composeConfig(ctx, agent, insightGroupId);

      const assistant = agent.providerAssistantId
        ? await this.provider.updateAssistant(agent.providerAssistantId, config)
        : await this.provider.createAssistant(config);

      // The identifiers land before anything else can fail — see above: an id
      // the row never learns about is a provider resource nothing owns, and the
      // next save would create a second assistant beside it.
      const synced = await this.agents.update(agent.id, {
        providerAssistantId: assistant.assistantId,
        providerTexmlAppId: assistant.callingAppId,
        providerInsightGroupId: insightGroupId,
        analysisSettings: analysisAfterSync,
        status: this.nextStatus(agent, blueprint.requiresCalendar),
        lastError: null,
      });

      await this.configureCallingApp(assistant.callingAppId);
      return synced;
    } catch (error) {
      // The provider's own failures arrive as `HttpException`s whose `.message`
      // is the placeholder "Http Exception" — storing that verbatim is how a
      // user ends up looking at an error that says nothing. `lastError` is read
      // straight out onto the agent screen, so it has to be a sentence.
      const message = describeTelnyxError(
        error,
        "The voice provider rejected this configuration. Save again to retry.",
      );
      this.logger.error(`Could not sync agent ${agent.id}: ${message}`);
      return this.agents.update(agent.id, {
        status: AiVoiceAgentStatus.error,
        lastError: message,
      });
    }
  }

  /**
   * Applies Ringee's requirements to the calling application the provider
   * provisions for an assistant: where its events go, that it reports what a
   * call cost, and which outbound route it bills through.
   *
   * Runs on every save because the application is created by the provider, on
   * its own defaults, some moment after the assistant itself — so "configure it
   * once at creation" would leave the first one unconfigured. A `null` id is
   * simply "not provisioned yet"; `ensureCallingApp` catches up when it
   * appears.
   */
  private async configureCallingApp(
    callingAppId: string | null,
  ): Promise<void> {
    if (!callingAppId) return;
    await this.provider.configureCallingApp(callingAppId, {
      eventWebhookUrl: this.callEventWebhookUrl(),
      callCostEvents: true,
      outboundProfileId: apiConfiguration.TELNYX_OUTBOUND_VOICE_PROFILE_ID,
    });
  }

  /**
   * Configures the calling application a call is about to go out through, and
   * writes its id down when the row does not have it yet.
   *
   * The dial path calls this rather than trusting the agent's last save: an
   * agent saved before Ringee configured these applications at all, or one
   * whose application the provider re-provisioned, would otherwise keep placing
   * calls through an application that bills through the wrong route and reports
   * no cost — with nothing to ever fix it but the user happening to save again.
   */
  async ensureCallingApp(
    agent: AiVoiceAgent,
    callingAppId: string,
  ): Promise<void> {
    await this.configureCallingApp(callingAppId);
    if (agent.providerTexmlAppId !== callingAppId) {
      await this.agents.update(agent.id, { providerTexmlAppId: callingAppId });
    }
  }

  /**
   * Points the agent's analysis group at Ringee's callback before a call goes
   * out through it.
   *
   * Same reason as `ensureCallingApp`, and the same failure: an agent whose
   * group was created before there was a callback to give it analyses every
   * call it makes and delivers the results nowhere (AGENT-009). Waiting for the
   * user to happen to save the agent again is not a repair — a call about to be
   * placed is the moment to be sure.
   *
   * A group the agent does not have yet is not created here: the analyses that
   * belong in it are synced on save, and an empty group would only analyse
   * nothing more quietly.
   */
  async ensureInsightGroup(agent: AiVoiceAgent): Promise<void> {
    if (!agent.providerInsightGroupId) return;
    await this.provider.updateInsightGroup(agent.providerInsightGroupId, {
      name: `Ringee agent ${agent.id}`,
      webhookUrl: this.insightsCallbackUrl(agent.id),
    });
  }

  /**
   * Makes sure the agent's tools still call this backend, before it dials.
   *
   * Tool URLs are written onto the assistant when the agent is saved and never
   * looked at again, so they outlive the address they were built from: change
   * `PUBLIC_BACKEND_URL` and every agent in the workspace keeps pointing at the
   * old one until somebody happens to open and re-save it. That is not a
   * degraded agent — it is one that answers "I am having a technical problem
   * with the calendar" and books nothing, on a call the workspace paid for.
   *
   * Best-effort, like `ensureCallingApp` and `ensureInsightGroup` beside it: a
   * re-sync that fails is worth a call with stale tools, never worth refusing
   * the call the user asked for.
   */
  async ensureToolEndpoints(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
  ): Promise<void> {
    if (!agent.providerAssistantId) return;

    const assistant = await this.provider.getAssistant(
      agent.providerAssistantId,
    );
    if (!assistant) return;

    const base = this.toolBaseUrl();
    const stale = assistant.toolWebhookUrls.filter(
      (url) => !url.startsWith(base),
    );
    if (stale.length === 0) return;

    this.logger.warn(
      `Agent ${agent.id} has ${stale.length} tool(s) pointing somewhere else (${stale[0]}); re-syncing against ${base}`,
    );
    await this.syncToProvider(ctx, agent.id);
  }

  /**
   * Creates, updates or removes each analysis so the provider's insight group
   * matches the user's post-call configuration exactly — no orphans left
   * running and billing after a field is deleted.
   */
  private async syncInsights(
    agent: AiVoiceAgentWithSources,
    insightGroupId: string,
  ): Promise<VoiceAgentAnalysisSettings["insightIds"]> {
    const analysis = this.readAnalysis(agent);
    const blueprint = this.blueprints.require(agent.type);
    const wanted: VoiceAgentBlueprintInsights = blueprint.buildInsights({
      analysis,
      extractionFields: this.readExtractionFields(agent),
    });

    const slots = ["summary", "outcome", "sentiment", "extraction"] as const;
    const ids: VoiceAgentAnalysisSettings["insightIds"] = {};

    for (const slot of slots) {
      const definition = wanted[slot];
      const existingId = analysis.insightIds[slot];

      if (definition && existingId) {
        await this.provider.updateInsight(existingId, definition);
        ids[slot] = existingId;
      } else if (definition) {
        ids[slot] = await this.provider.createInsight(
          insightGroupId,
          definition,
        );
      } else if (existingId) {
        await this.provider.deleteInsight(insightGroupId, existingId);
      }
    }
    return ids;
  }

  private async composeConfig(
    ctx: OwnershipContext,
    agent: AiVoiceAgentWithSources,
    insightGroupId: string,
  ): Promise<VoiceAgentConfig> {
    const blueprint = this.blueprints.require(agent.type);
    const { company, promptContext, defaults } = await this.resolveConversation(
      ctx,
      agent,
    );
    const language = promptContext.language;
    const conversation = readVoiceAgentConversationSettings(
      agent.conversationSettings,
      defaults,
    );

    const tools = blueprint.buildTools({
      agentId: agent.id,
      toolBaseUrl: this.toolBaseUrl(),
      toolSecretRef: this.toolSecretIdentifier(agent.id),
      knowledgeBucketIds: this.readyKnowledgeBuckets(agent),
    });

    return {
      name: agent.name,
      instructions: composeVoiceAgentInstructions(
        conversation,
        defaults,
        blueprint.buildSafetyInstructions(promptContext),
      ),
      greeting: conversation.greeting,
      greetingMode: conversation.greetingMode,
      modelId: resolveVoiceAgentModel(
        agent.modelProvider as VoiceAgentLlmProvider,
      ).modelId,
      llmApiKeyRef: agent.llmApiKeyRef,
      voiceId: agent.voiceId,
      language,
      dynamicVariables: this.defaultDynamicVariables(agent, company),
      tools,
      insightGroupId,
      maxCallSeconds: apiConfiguration.AI_VOICE_AGENT_MAX_CALL_SECONDS,
      recordCalls: true,
      postConversationEnabled: conversation.postConversationEnabled,
    };
  }

  private async resolveConversation(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
  ): Promise<{
    company: { name: string; description: string; website: string };
    promptContext: VoiceAgentPromptContext;
    defaults: VoiceAgentConversationSettings;
  }> {
    const blueprint = this.blueprints.require(agent.type);
    const company = await this.companyProfiles.resolveForAgent(ctx, agent);
    const promptContext: VoiceAgentPromptContext = {
      agentName: agent.name,
      company,
      language: agent.voiceLanguage ?? "en",
      timezone: agent.timezone,
      meetingDurationMinutes: agent.meetingDurationMinutes,
      meetingTitle: agent.meetingTitle,
    };
    return {
      company,
      promptContext,
      defaults: {
        greetingMode: "assistant_speaks_first",
        greeting: blueprint.buildGreeting(promptContext),
        instructions: blueprint.buildInstructions(promptContext),
        postConversationEnabled: false,
        postConversationInstructions: "",
      },
    };
  }

  private validateConversationSettings(
    settings: VoiceAgentConversationSettings,
  ): VoiceAgentConversationSettings {
    if (!settings.instructions.trim()) {
      throw new BadRequestException("Instructions cannot be empty.");
    }
    if (
      settings.greetingMode === "assistant_speaks_first" &&
      !settings.greeting.trim()
    ) {
      throw new BadRequestException(
        "Add a greeting or choose a mode that waits for the user.",
      );
    }
    return settings;
  }

  /**
   * Defaults for every variable the instructions interpolate. Ringee's own
   * variables carry real values; the per-call ones default to empty so an
   * unset optional variable reads as absent instead of leaving `{{reason}}`
   * in what the agent says.
   *
   * Public because a browser test session temporarily replaces these and has to
   * be able to put them back exactly as they were.
   */
  async resolveDefaultVariables(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
  ): Promise<Record<string, string>> {
    const company = await this.companyProfiles.resolveForAgent(ctx, agent);
    return this.defaultDynamicVariables(agent, company);
  }

  private defaultDynamicVariables(
    agent: AiVoiceAgent,
    company: { name: string; description: string; website: string },
  ): Record<string, string> {
    const blueprint = this.blueprints.require(agent.type);
    const variables: Record<string, string> = {
      agent_name: agent.name,
      company_name: company.name,
      company_description: company.description,
      company_website: company.website,
    };
    for (const variable of blueprint.variables) {
      variables[variable.key] = "";
    }
    return variables;
  }

  private readyKnowledgeBuckets(agent: AiVoiceAgentWithSources): string[] {
    const buckets = agent.knowledgeSources
      .filter((source) => source.status === "ready" && source.providerBucket)
      .map((source) => source.providerBucket!);
    return [...new Set(buckets)];
  }

  private nextStatus(
    agent: AiVoiceAgent,
    requiresCalendar: boolean,
  ): AiVoiceAgentStatus {
    if (agent.status === AiVoiceAgentStatus.disabled) return agent.status;
    if (requiresCalendar && !agent.calendarIntegrationId) {
      return AiVoiceAgentStatus.draft;
    }
    if (agent.modelProvider !== "ringee" && !agent.llmApiKeyRef) {
      return AiVoiceAgentStatus.draft;
    }
    return AiVoiceAgentStatus.active;
  }

  // ── Small helpers ────────────────────────────────────────────

  readAnalysis(agent: AiVoiceAgent | null): VoiceAgentAnalysisSettings {
    const raw = agent?.analysisSettings as VoiceAgentAnalysisSettings | null;
    return {
      ...DEFAULT_ANALYSIS_SETTINGS,
      ...(raw ?? {}),
      insightIds: raw?.insightIds ?? {},
    };
  }

  readExtractionFields(agent: AiVoiceAgent): VoiceAgentExtractionField[] {
    const raw = agent.extractionFields;
    return Array.isArray(raw)
      ? (raw as unknown as VoiceAgentExtractionField[])
      : [];
  }

  private mergeAnalysis(
    current: VoiceAgentAnalysisSettings | null,
    patch: SaveVoiceAgentInput["analysis"],
  ): VoiceAgentAnalysisSettings {
    const base = current ?? DEFAULT_ANALYSIS_SETTINGS;
    return {
      ...base,
      ...(patch ?? {}),
      // The outcome is what callers branch on, so it is not optional.
      outcome: true,
      insightIds: base.insightIds ?? {},
    };
  }

  private requireName(name: string): string {
    const trimmed = name?.trim() ?? "";
    if (!trimmed) throw new BadRequestException("The agent needs a name.");
    if (trimmed.length > 60) {
      throw new BadRequestException("The agent name is too long.");
    }
    return trimmed;
  }

  /**
   * A number may only be assigned to an agent if this workspace can present it
   * on an AI agent call — the client sends an id, never the right to use it.
   */
  private async assertCallerNumberUsable(
    ctx: OwnershipContext,
    callerNumberId: string,
  ): Promise<void> {
    const usable = await this.listCallerNumbers(ctx);
    if (!usable.some((number) => number.id === callerNumberId)) {
      throw new NotFoundException(
        "That number is not available for AI agent calls.",
      );
    }
  }

  /**
   * Checked again at activation, not only at assignment: a number can be
   * released or restricted after an agent was pointed at it, and an agent that
   * goes live with no caller ID fails on its first call instead of here.
   */
  private async assertCallerNumberReady(
    ctx: OwnershipContext,
    agent: AiVoiceAgent,
  ): Promise<void> {
    const usable = await this.listCallerNumbers(ctx);
    if (usable.length === 0) {
      throw new BadRequestException(
        "No number in this workspace can place AI agent calls. Buy a number or verify a caller ID first.",
      );
    }
    if (
      agent.callerNumberId &&
      !usable.some((number) => number.id === agent.callerNumberId)
    ) {
      throw new BadRequestException(
        "The number assigned to this agent is no longer available. Assign another one.",
      );
    }
  }

  private async assertCalendarInWorkspace(
    ctx: OwnershipContext,
    calendarIntegrationId: string,
  ): Promise<void> {
    const integrations = await this.calendars.findByUserOrOrg(
      ctx.userId,
      ctx.organizationId ?? null,
    );
    if (!integrations.some((i) => i.id === calendarIntegrationId)) {
      throw new NotFoundException("Calendar integration not found");
    }
  }

  /**
   * Resolves a chosen voice against the curated catalogue. The voice's language
   * decides what language the agent speaks, so an unknown id is rejected rather
   * than stored and discovered mid-call.
   */
  private async resolveVoice(
    voiceId: string | null | undefined,
  ): Promise<VoiceAgentVoice | null> {
    if (!voiceId) return null;
    const voices = await this.listVoices();
    const voice = voices.find((v) => v.id === voiceId);
    if (!voice) {
      throw new BadRequestException("That voice is not available.");
    }
    return voice;
  }

  private generateToolSecret(): string {
    return `rva_${randomBytes(32).toString("hex")}`;
  }

  private toolSecretIdentifier(agentId: string): string {
    return `ringee-voice-agent-tool-${agentId}`;
  }

  private toolBaseUrl(): string {
    return `${this.publicBase()}/api/ai-voice-agents/tools`;
  }

  /**
   * Where the provider delivers an agent's call events. It is the ordinary
   * signed call webhook: cost records and saved recordings are the same events
   * every other Ringee call already settles through, and they belong on the
   * same normalizer rather than on a second path of their own.
   */
  private callEventWebhookUrl(): string {
    return `${this.publicBase()}/api/call/webhook`;
  }

  /**
   * Where the provider posts an agent's finished post-call analysis.
   *
   * A group carries a URL and nothing else — no headers, no signature Ringee
   * can pin — so the URL is the authorization: a token derived from the agent
   * id, which the route verifies before it writes a summary onto a call.
   */
  private insightsCallbackUrl(agentId: string): string {
    const token = voiceAgentInsightsToken(agentId);
    return `${this.publicBase()}/api/ai-voice-agents/webhooks/insights/${agentId}/${token}`;
  }

  private publicBase(): string {
    return apiConfiguration.PUBLIC_BACKEND_URL!.replace(/\/+$/, "");
  }
}
