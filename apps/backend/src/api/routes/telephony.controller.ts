import {
  Body,
  Controller,
  Get,
  BadRequestException,
  NotFoundException,
  Param,
  Post,
  Query,
  ParseIntPipe,
} from "@nestjs/common";
import {
  AvailableNumber,
  CurrentUser,
  Public,
  TelephonyService,
  createOwnershipContext,
} from "@ringee/platform";
import { TelephonyCountryRate } from "@ringee/platform";
import { CallerIdService, NumberPurchasedService } from "@ringee/services";
import {
  RequestCallerIdVerificationDto,
  VerifyCallerIdDto,
} from "@ringee/platform";
import {
  Call,
  CallStatus,
  NumberPurchased,
  TelnyxRatePerMinuteRepository,
} from "@ringee/database";
import { UserService, RecordingService, CallService } from "@ringee/services";

interface CurrentUserData {
  id: string;
  activeOrgId?: string | null;
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
  ) { }

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
    @Query("limit", ParseIntPipe) limit?: number,
  ): Promise<AvailableNumber[] | null> {
    if (!country) {
      throw new BadRequestException("Country is required");
    }

    return this.telephonyService.searchAvailableNumbers({
      countryCode: country,
      areaCode,
      numberType,
      limit,
    });
  }

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
    );
  }

  @Post("caller-id/:id/verify")
  async verifyVerification(
    @Body() body: VerifyCallerIdDto,
    @Param("id") id: string,
  ) {
    return this.callerIdService.verifyCallerId(id, body.verificationCode);
  }

  @Get("phone-numbers")
  async getPhoneNumbers(
    @CurrentUser() user: CurrentUserData,
  ): Promise<NumberPurchased[]> {
    const ctx = createOwnershipContext(user);
    return this.numberPurchasedService.findByOwner(ctx);
  }

  @Get("calls")
  async getCalls(
    @CurrentUser() user: CurrentUserData,
    @Query()
    query: {
      page?: number;
      limit?: number;
      status?: CallStatus[];
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
    return this.callService.listByOwnerPaginated(ctx, query);
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
