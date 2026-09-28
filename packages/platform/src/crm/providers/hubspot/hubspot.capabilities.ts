import type { CrmCapabilities } from "../../types";
import { HUBSPOT_BODY_LIMIT } from "./hubspot.api";

/**
 * What the HubSpot adapter can do when the portal granted every scope Ringee
 * asks for. Lists and recording uploads ride on optional scopes, so the
 * capabilities stored on each connection at connect time
 * (`HubSpotProvider.getWorkspaceInfo`) say what one portal actually allows.
 */
export const HUBSPOT_CAPABILITIES: CrmCapabilities = {
  supportsCompanies: true,
  supportsTasks: true,
  supportsLists: true,
  supportsMeetings: true,
  supportsRecordingUpload: true,
  supportsRecordingUrl: true,
  supportsTranscript: true,
  // Calls are logged as native HubSpot call activities, not as notes.
  supportsCallObject: true,
  maxNoteLength: HUBSPOT_BODY_LIMIT,
  // Public apps get 110 requests per rolling 10 seconds per portal; the CRM
  // search endpoints are further limited to 5 requests per second.
  rateLimit: { requestsPerMinute: 600, burst: 100 },
};
