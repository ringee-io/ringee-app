import { z } from "zod";
import { CallHistoryEntrySchema } from "../utils/types";
import type { CallHistoryEntry } from "../utils/types";
import { ringeeRequest } from "../utils/ringee-api";

const ResponseSchema = z.array(CallHistoryEntrySchema);

export default async function getCallHistory({
  phoneNumbers,
  limit = 20,
}: {
  phoneNumbers: string[];
  limit?: number;
}): Promise<CallHistoryEntry[]> {
  if (phoneNumbers.length === 0) return [];

  try {
    const data = await ringeeRequest<unknown>("/call-history", {
      query: {
        phones: phoneNumbers.join(","),
        limit: String(limit),
      },
    });
    return ResponseSchema.parse(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch call history";
    console.error(`[getCallHistory] ${message}`);
    throw new Error(message);
  }
}
