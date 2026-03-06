import { Controller } from "@nestjs/common";
import { EventPattern } from "@nestjs/microservices";
import { WorkerService } from "./woorker.service";

@Controller()
export class WorkerController {
  constructor(private readonly workerService: WorkerService) { }

  @EventPattern("ringee_add_job")
  async handleEvent(data: any) {
    await this.workerService.handleEvent(data);
  }
}
