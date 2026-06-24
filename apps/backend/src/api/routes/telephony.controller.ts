import {
  Body,
  Controller,
  Delete,
  Get,
  BadRequestException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AvailableNumber,
  CurrentUser,
  NumberFeature,
  OrgAdminOnly,
  Public,
  TelephonyService,
  createOwnershipContext,
  resolveMemberFilter,
} from "@ringee/platform";
import { TelephonyCountryRate } from "@ringee/platform";
import {
  CallerIdService,
  NumberPurchasedService,
  RegulatoryDocumentService,
} from "@ringee/services";
import {
  RequestCallerIdVerificationDto,
  SaveRequirementsDraftDto,
  SetCallerIdActiveDto,
  SubmitRequirementsDto,
  ValidateAddressDto,
  VerifyCallerIdDto,
} from "@ringee/platform";
import {
  Call,
  CallStatus,
  CallOutcome,
  NumberPurchased,
  TelnyxRatePerMinuteRepository,
} from "@ringee/database";
import { UserService, RecordingService, CallService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
  activeOrgRole?: string | null;
}

@Controller("telephony")
export class TelephonyController {
  constructor(
    private readonly telephonyService: TelephonyService,
    private readonly callerIdService: CallerIdService,
    private readonly userService: UserService,
    private readonly numberPurchasedService: NumberPurchasedService,
    private readonly callService: CallService,
    private readonly ratePerMinuteRepository: TelnyxRatePerMinuteRepository,
    private readonly recordingService: RecordingService,
    private readonly regulatoryDocumentService: RegulatoryDocumentService,
  ) {}

  @Public()
  @Get("rates")
  async getRates(): Promise<TelephonyCountryRate[]> {
    return this.ratePerMinuteRepository.getRates();
  }

  @Public()
  @Get("rates/:codeOrName")
  async getRateByCountry(
    @Param("codeOrName") codeOrName: string,
  ): Promise<TelephonyCountryRate | null> {
    return this.ratePerMinuteRepository.getRateByCountry(codeOrName);
  }

  @Public()
  @Get("numbers/available/:country")
  async getNumbersByCountry(
    @Param("country") country: string,
    @Query("areaCode") areaCode?: string,
    @Query("numberType") numberType?: "local" | "toll_free",
    @Query("features") features?: string | string[],
    @Query("limit", ParseIntPipe) limit?: number,
  ): Promise<AvailableNumber[] | null> {
    if (!country) {
      throw new BadRequestException("Country is required");
    }

    return this.telephonyService.searchAvailableNumbers({
      countryCode: country,
      areaCode,
      numberType,
      features: parseFeatures(features),
      limit,
    });
  }

  @Public()
  @Get("numbers/requirements/:country")
  async getNumberRequirements(
    @Param("country") country: string,
    @Query("numberType")
    numberType?: "local" | "toll_free" | "mobile" | "national",
    @Query("action") action?: "ordering" | "porting",
  ) {
    if (!country) {
      throw new BadRequestException("Country is required");
    }

    return this.telephonyService.getRegulatoryRequirements({
      countryCode: country,
      phoneNumberType: numberType,
      action,
    });
  }

  @Get("caller-ids")
  async getCallerIds(@CurrentUser() user: CurrentUserData) {
    const ctx = createOwnershipContext(user);
    return this.callerIdService.getCallerIds(ctx);
  }

  /** The flat fee charged per caller-ID verification sent (for the UI to show). */
  @Get("caller-id/verification-fee")
  async getCallerIdVerificationFee() {
    return { fee: this.callerIdService.getVerificationFee() };
  }

  @OrgAdminOnly()
  @Post("caller-id")
  async requestVerification(
    @Body() body: RequestCallerIdVerificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.callerIdService.requestVerification(
      ctx,
      body.phoneNumber,
      body.method,
      body.extension,
      body.isoCountry,
    );
  }

  @OrgAdminOnly()
  @Post("caller-id/:id/verify")
  async verifyVerification(
    @Body() body: VerifyCallerIdDto,
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.callerIdService.verifyCallerId(ctx, id, body.verificationCode);
  }

  @OrgAdminOnly()
  @Patch("caller-id/:id/active")
  async setCallerIdActive(
    @Body() body: SetCallerIdActiveDto,
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    return this.callerIdService.setActive(ctx, id, body.active);
  }

  @OrgAdminOnly()
  @Delete("caller-id/:id")
  async deleteCallerId(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const ctx = createOwnershipContext(user);
    await this.callerIdService.removeCallerId(ctx, id);
    return { success: true };
  }

  @Get("phone-numbers")
  async getPhoneNumbers(
    @CurrentUser() user: CurrentUserData,
  ): Promise<NumberPurchased[]> {
    const ctx = createOwnershipContext(user);
    return this.numberPurchasedService.findByOwner(ctx);
  }

  @Post("phone-numbers/:id/refresh-messaging")
  async refreshMessaging(@Param("id") id: string) {
    return this.numberPurchasedService.refreshMessagingCapabilities(id);
  }

  @Get("phone-numbers/:id/requirements")
  async getPendingNumberRequirements(@Param("id") id: string) {
    return this.numberPurchasedService.getNumberRequirements(id);
  }

  /** Lists the workspace's reusable regulatory-document bucket. */
  @Get("regulatory-documents")
  async listRegulatoryDocuments(@CurrentUser() user: CurrentUserData) {
    return this.regulatoryDocumentService.list(createOwnershipContext(user));
  }

  /** Uploads a document to the workspace bucket (not sent to Telnyx yet). */
  @Post("regulatory-documents")
  @UseInterceptors(
    FileInterceptor("file", {
      // Telnyx caps documents at 20 MB.
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/jpg",
          "image/webp",
          "image/heic",
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Only PDF or image files (PNG, JPG, WEBP, HEIC) are allowed",
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadRegulatoryDocument(
    @CurrentUser() user: CurrentUserData,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    return this.regulatoryDocumentService.upload(createOwnershipContext(user), {
      buffer: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
    });
  }

  /** Removes a document from the workspace bucket. */
  @Delete("regulatory-documents/:id")
  async deleteRegulatoryDocument(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
  ) {
    await this.regulatoryDocumentService.delete(
      createOwnershipContext(user),
      id,
    );
    return { success: true };
  }

  /** Validates an address against the carrier's strict address validator. */
  @Post("addresses/validate")
  async validateAddress(@Body() body: ValidateAddressDto) {
    return this.telephonyService.validateAddress(body);
  }

  /** Autosaves the verification form so a reload restores it. */
  @Put("phone-numbers/:id/requirements/draft")
  async saveNumberRequirementsDraft(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: SaveRequirementsDraftDto,
  ) {
    return this.numberPurchasedService.saveRequirementDraft(
      createOwnershipContext(user),
      id,
      body.requirements,
    );
  }

  @Post("phone-numbers/:id/requirements/submit")
  async submitNumberRequirements(
    @CurrentUser() user: CurrentUserData,
    @Param("id") id: string,
    @Body() body: SubmitRequirementsDto,
  ) {
    return this.numberPurchasedService.submitNumberRequirements(
      createOwnershipContext(user),
      id,
      body.requirements,
    );
  }

  @Get("calls")
  async getCalls(
    @CurrentUser() user: CurrentUserData,
    @Query()
    query: {
      page?: number;
      limit?: number;
      status?: CallStatus[];
      outcome?: CallOutcome | CallOutcome[];
      dateFrom?: string;
      dateTo?: string;
      excludeCampaignCalls?: string;
      includeMeetings?: string;
      userId?: string;
      orderBy?: "createdAt" | "startedAt" | "endedAt";
      sortDirection?: "asc" | "desc";
    } = {},
  ): Promise<{
    data: Call[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const ctx = createOwnershipContext(user);
    const outcome = query.outcome
      ? Array.isArray(query.outcome)
        ? query.outcome
        : [query.outcome]
      : undefined;

    // Role-based member scoping: members are pinned to their own calls; admins
    // may request a specific member (or all); freelancers see their own.
    const requestedUserId = query.userId === "me" ? ctx.userId : query.userId;
    const memberUserId = resolveMemberFilter(user, requestedUserId);

    return this.callService.listByOwnerPaginated(ctx, {
      ...query,
      userId: memberUserId,
      outcome,
      excludeCampaignCalls: query.excludeCampaignCalls === "true",
      includeMeetings: query.includeMeetings === "true",
    });
  }

  @Get("calls/by-session/:sessionId")
  async getCallBySession(
    @Param("sessionId") sessionId: string,
  ): Promise<Call | null> {
    return this.callService.findOneBySessionId(sessionId);
  }

  @Post("recordings/start")
  async start(@Body("callSessionId") callSessionId: string) {
    const call = await this.callService.findOneBySessionId(callSessionId);

    if (!call) {
      throw new NotFoundException("Call not found");
    }

    const recording = await this.recordingService.createRecording({
      callId: call.id,
    });

    await this.telephonyService.startRecording(call.callControlId!);

    return recording;
  }

  @Post("recordings/stop")
  async stop(
    @Body("recordingId") recordingId: string,
    @Body("callSessionId") callSessionId: string,
  ) {
    if (!recordingId || !callSessionId) {
      throw new BadRequestException(
        "Recording ID and call session ID are required",
      );
    }

    const call = await this.callService.findOneBySessionId(callSessionId);

    if (!call) {
      throw new NotFoundException("Call not found");
    }

    const recording = await this.recordingService.getRecording(recordingId);

    if (!recording) {
      throw new NotFoundException("Recording not found");
    }

    await this.recordingService.updateRecording(recording.id, {
      status: "processing",
    });

    await this.telephonyService.stopRecording(call.callControlId!);

    return recording;
  }
}

const ALLOWED_FEATURES: ReadonlySet<NumberFeature> = new Set([
  "sms",
  "mms",
  "voice",
  "fax",
  "emergency",
  "hd_voice",
  "international_sms",
  "local_calling",
]);

function parseFeatures(
  raw: string | string[] | undefined,
): NumberFeature[] | undefined {
  if (!raw) return undefined;
  const parts = (Array.isArray(raw) ? raw : raw.split(","))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const valid = parts.filter((part): part is NumberFeature =>
    ALLOWED_FEATURES.has(part as NumberFeature),
  );
  return valid.length > 0 ? Array.from(new Set(valid)) : undefined;
}
