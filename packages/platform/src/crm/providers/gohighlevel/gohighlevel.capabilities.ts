import type { CrmCapabilities } from "../../types";

export const GOHIGHLEVEL_CAPABILITIES: CrmCapabilities = {
  // HighLevel contacts expose companyName, but a location contact is the
  // reliable common object for activities. Keep company object sync disabled
  // until the v3 Companies API is enabled for every target account.
  supportsCompanies: false,
  supportsTasks: true,
  supportsLists: false,
  supportsMeetings: true,
  supportsRecordingUpload: false,
  supportsRecordingUrl: true,
  supportsTranscript: true,
  supportsCallObject: false,
  maxNoteLength: 65_536,
  rateLimit: { requestsPerMinute: 600, burst: 100 },
};
