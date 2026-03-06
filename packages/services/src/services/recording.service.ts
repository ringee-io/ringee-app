import { Injectable } from "@nestjs/common";
import { RecordingRepository, Recording } from "@ringee/database";
import { CreateRecordingDto, UpdateRecordingDto } from "@ringee/platform";

@Injectable()
export class RecordingService {
  constructor(private readonly repository: RecordingRepository) { }

  async createRecording(dto: CreateRecordingDto): Promise<Recording> {
    return this.repository.create({
      call: { connect: { id: dto.callId } },
      url: dto.url,
      format: dto.format,
      status: dto.status,
    });
  }

  async updateRecording(
    id: string,
    dto: UpdateRecordingDto,
  ): Promise<Recording> {
    return this.repository.update(id, {
      url: dto.url,
      format: dto.format,
      status: dto.status,
    });
  }

  async getRecording(id: string): Promise<Recording | null> {
    return this.repository.findById(id);
  }

  async findRecordingsByCallId(callId: string): Promise<Recording[]> {
    return this.repository.findByCallId(callId);
  }
}
