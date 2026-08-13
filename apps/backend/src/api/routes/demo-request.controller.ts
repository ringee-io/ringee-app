import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { DemoRequestService } from "@ringee/services";
import { CreateDemoRequestDto, Public } from "@ringee/platform";

/**
 * Demo requests from the public marketing site (/request-demo). Public — the
 * visitor is not signed in. The service stores the request and emails both
 * the Ringee team and the requester.
 */
@Controller("demo-requests")
export class DemoRequestController {
  constructor(private readonly demoRequestService: DemoRequestService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateDemoRequestDto) {
    return this.demoRequestService.createRequest(body);
  }
}
