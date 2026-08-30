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
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AddKnowledgeTextDto,
  AddKnowledgeUrlDto,
  CreateVoiceAgentDto,
  CurrentUser,
  CurrentUserData,
  GenerateCompanyProfileDto,
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

/**
 * AI Voice Agents.
 *
 * Thin by design: authenticate, build the ownership context, delegate. Every
 * rule about what an agent is and when it may call lives in `@ringee/services`,
 * because the same rules have to hold for the API, the CLI and the MCP tools.
 */
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

  @Get("models")
  listModels() {
    // Only the user-facing choice and whether it needs a key — never the
    // provider-side model id Ringee picked.
    return listVoiceAgentModels().map(({ provider, requiresApiKey }) => ({
      provider,
      requiresApiKey,
    }));
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
  @UseInterceptors(FileInterceptor("file"))
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
