import type { CrmCapabilities } from "../../types";

export const HUBSPOT_CAPABILITIES: CrmCapabilities = {
  supportsCompanies: true,
  supportsTasks: true,
  supportsLists: false,
  supportsMeetings: true,
  supportsRecordingUpload: false,
  supportsRecordingUrl: true,
  supportsTranscript: true,
  supportsCallObject: true,
  maxNoteLength: 65_536,
  rateLimit: { requestsPerMinute: 180, burst: 100 },
};
