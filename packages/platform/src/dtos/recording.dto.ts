export class CreateRecordingDto {
  callId!: string;
  url?: string;
  format?: string;
  status?: string;
}

export class UpdateRecordingDto {
  url?: string;
  format?: string;
  status?: string;
}
