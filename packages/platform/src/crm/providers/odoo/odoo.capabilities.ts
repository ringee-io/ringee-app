import type { CrmCapabilities } from "../../types";

export const ODOO_CAPABILITIES: CrmCapabilities = {
  supportsCompanies: true,
  supportsTasks: true,
  supportsLists: false,
  supportsMeetings: true,
  supportsRecordingUpload: true,
  supportsRecordingUrl: true,
  supportsTranscript: true,
  supportsCallObject: false,
  maxNoteLength: 64_000,
  rateLimit: { requestsPerMinute: 120, burst: 20 },
};
