import type { CrmCapabilities } from "../../types";

export const ATTIO_CAPABILITIES: CrmCapabilities = {
  supportsCompanies: true,
  supportsTasks: true,
  supportsLists: true,
  supportsMeetings: true,
  supportsRecordingUpload: true,
  supportsRecordingUrl: true,
  supportsTranscript: true,
  supportsCallObject: false,
  maxNoteLength: 100_000,
  rateLimit: { requestsPerMinute: 300, burst: 30 },
};
