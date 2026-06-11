import { CallSessionResultSchema } from "../utils/types";
import type { CallSessionResult } from "../utils/types";
import { ringeeRequest } from "../utils/ringee-api";

export default async function prepareCallSession({
  toNumber,
  fromNumber,
  recordName,
  attioRecordId,
  attioObjectType,
}: {
  toNumber: string;
  fromNumber: string;
  recordName?: string;
  attioRecordId?: string;
  attioObjectType?: string;
}): Promise<CallSessionResult> {
  try {
    const data = await ringeeRequest<unknown>("/call-session", {
      method: "POST",
      body: {
        toNumber,
        fromNumber,
        recordName,
        attioRecordId,
        attioObjectType,
      },
    });
    return CallSessionResultSchema.parse(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to prepare call session";
    console.error(`[prepareCallSession] ${message}`);
    throw new Error(message);
  }
}
