import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { apiConfiguration } from "@ringee/configuration";
import {
  AddKnowledgeTextDto,
  AddKnowledgeUrlDto,
  CreateVoiceAgentDto,
  CurrentUser,
  CurrentUserData,
  GenerateCompanyProfileDto,
  ReuseKnowledgeSourceDto,
  SaveCompanyProfileDto,
  SaveVoiceAgentDto,
  SetVoiceAgentStatusDto,
  StartVoiceAgentCallDto,
  StartVoiceAgentTestSessionDto,
  VerifyVoiceAgentCredentialDto,
  createOwnershipContext,
  listVoiceAgentModels,
} from "@ringee/platform";
import {
  CompanyProfileService,
  VoiceAgentCallService,
  VoiceAgentKnowledgeService,
  VoiceAgentResultService,
  VoiceAgentService,
  VoiceAgentTestSessionService,
} from "@ringee/services";
import { AiVoiceAgentType } from "@ringee/database";
import { VoiceAgentBetaGuard } from "../guards/voice-agent-beta.guard";

/**
 * AI Voice Agents.
 *
 * Thin by design: authenticate, build the ownership context, delegate. Every
 * rule about what an agent is and when it may call lives in `@ringee/services`,
 * because the same rules have to hold for the API, the CLI and the MCP tools.
 *
 * The whole controller sits behind `VoiceAgentBetaGuard` while the module is in
 * a closed production beta. The provider-facing webhook and tool controllers
 * are separate and stay open, so a call already in flight is unaffected.
 */
@UseGuards(VoiceAgentBetaGuard)
@Controller("ai-voice-agents")
export class AiVoiceAgentController {
  constructor(
    private readonly agents: VoiceAgentService,
    private readonly calls: VoiceAgentCallService,
    private readonly results: VoiceAgentResultService,
    private readonly testSessions: VoiceAgentTestSessionService,
    private readonly knowledge: VoiceAgentKnowledgeService,
    private readonly companyProfiles: CompanyProfileService,
  ) {}

  // ── Catalogue ────────────────────────────────────────────────
  // Declared before the `:id` routes so they are not swallowed by them.

  @Get("types")
  listTypes() {
    return this.agents.listTypes();
  }

  @Get("voices")
  listVoices() {
    return this.agents.listVoices();
  }

  /**
   * A short sample of one voice, inlined as base64 so the picker can play it
   * with the same authenticated client it lists voices with.
   */
  @Get("voices/:voiceId/preview")
  previewVoice(@Param("voiceId") voiceId: string) {
    return this.agents.previewVoice(voiceId);
  }

  /**
   * The numbers this workspace may present on an AI agent call — what the agent
   * form assigns from, and what the trigger dialog offers when an agent carries
   * no assignment of its own.
   */
  @Get("phone-numbers")
  listCallerNumbers(@CurrentUser() user: CurrentUserData) {
    return this.agents.listCallerNumbers(createOwnershipContext(user));
  }

  @Get("models")
  listModels() {
    // The whole catalogue entry: someone choosing between Ringee AI and their
    // own key is choosing between two named models, and the version is what
    // tells them which one they are getting. Ringee still decides the mapping.
    return listVoiceAgentModels();
  }

  @Post("credentials/verify")
  verifyCredential(@Body() dto: VerifyVoiceAgentCredentialDto) {
    return this.agents.verifyCredential(dto.provider, dto.apiKey);
  }

  // ── Company context ──────────────────────────────────────────

  @Get("company-profile")
  getCompanyProfile(@CurrentUser() user: CurrentUserData) {
    return this.companyProfiles.get(createOwnershipContext(user));
  }

  /** Contexts already written in this workspace, for a new agent to adopt. */
  @Get("company-contexts")
  listCompanyContexts(@CurrentUser() user: CurrentUserData) {
    return this.companyProfiles.listReusable(createOwnershipContext(user));
  }

  @Patch("company-profile")
  saveCompanyProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SaveCompanyProfileDto,
  ) {
    return this.companyProfiles.save(createOwnershipContext(user), dto);
  }

  @Post("company-profile/generate")
  generateCompanyProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: GenerateCompanyProfileDto,
  ) {
    return this.companyProfiles.generateDescription(
      createOwnershipContext(user),
      dto.website,
    );
  }

  // ── Calls (flat routes first) ────────────────────────────────

  @Get("calls/:callId")
  async getCall(
    @CurrentUser() user: CurrentUserData,
    @Param("callId", ParseUUIDPipe) callId: string,
  ) {
    const call = await this.calls.requireCall(
      createOwnershipContext(user),
      callId,
    );
    return this.results.toResult(call);
  }

  // ── Agents ───────────────────────────────────────────────────

  @Get()
  list(
    @CurrentUser() user: CurrentUserData,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("type") type?: AiVoiceAgentType,
  ) {
    return this.agents.list(createOwnershipContext(user), {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      type,
    });
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateVoiceAgentDto,
  ) {
    return this.agents.create(createOwnershipContext(user), {
      ...dto,
      type: dto.type as AiVoiceAgentType,
    });
  }

  @Get(":id")
  get(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.agents.require(createOwnershipContext(user), id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveVoiceAgentDto,
  ) {
    return this.agents.update(createOwnershipContext(user), id, dto);
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.agents.delete(createOwnershipContext(user), id);
    return { deleted: true };
  }

  @Post(":id/status")
  setStatus(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetVoiceAgentStatusDto,
  ) {
    return this.agents.setStatus(createOwnershipContext(user), id, dto.status);
  }

  // ── Execution ────────────────────────────────────────────────

  @Post(":id/calls")
  startCall(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StartVoiceAgentCallDto,
  ) {
    return this.calls.startCall(createOwnershipContext(user), id, {
      to: dto.to,
      fromNumberId: dto.from_number_id,
      variables: dto.variables,
      metadata: dto.metadata,
    });
  }

  @Get(":id/calls")
  listCalls(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.calls.listCalls(createOwnershipContext(user), id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ── Knowledge ────────────────────────────────────────────────

  @Get(":id/knowledge")
  listKnowledge(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.knowledge.list(createOwnershipContext(user), id);
  }

  /**
   * Everything the workspace has already uploaded, on the other agents, so the
   * same document can be put on this one without finding the original file.
   */
  @Get(":id/knowledge/library")
  listKnowledgeLibrary(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.knowledge.library(createOwnershipContext(user), id);
  }

  @Post(":id/knowledge/reuse")
  reuseKnowledge(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReuseKnowledgeSourceDto,
  ) {
    return this.knowledge.reuse(createOwnershipContext(user), id, dto.sourceId);
  }

  @Post(":id/knowledge/url")
  addKnowledgeUrl(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddKnowledgeUrlDto,
  ) {
    return this.knowledge.addUrl(createOwnershipContext(user), id, dto);
  }

  @Post(":id/knowledge/text")
  addKnowledgeText(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddKnowledgeTextDto,
  ) {
    return this.knowledge.addText(createOwnershipContext(user), id, dto);
  }

  @Post(":id/knowledge/document")
  // The limit is enforced here as well as in the service: multer buffers the
  // whole upload into memory before any handler runs, so an application-level
  // check alone is a memory-exhaustion vector. Same number from the same
  // configuration value, so the two can never disagree.
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: apiConfiguration.AI_VOICE_AGENT_MAX_DOCUMENT_MB * 1024 * 1024,
      },
    }),
  )
  addKnowledgeDocument(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
    },
  ) {
    if (!file) throw new BadRequestException("A file is required.");
    return this.knowledge.addDocument(createOwnershipContext(user), id, {
      fileName: file.originalname,
      contentType: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Delete(":id/knowledge/:sourceId")
  async removeKnowledge(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("sourceId", ParseUUIDPipe) sourceId: string,
  ) {
    await this.knowledge.remove(createOwnershipContext(user), id, sourceId);
    return { removed: true };
  }

  // ── Test conversations ───────────────────────────────────────

  @Post(":id/test-session")
  startTestSession(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StartVoiceAgentTestSessionDto,
  ) {
    return this.testSessions.start(
      createOwnershipContext(user),
      id,
      dto?.variables,
    );
  }

  @Delete(":id/test-session")
  async endTestSession(
    @CurrentUser() user: CurrentUserData,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.testSessions.end(createOwnershipContext(user), id);
    return { closed: true };
  }
}
