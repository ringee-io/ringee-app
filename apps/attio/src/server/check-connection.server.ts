import { getWorkspaceSetting } from "attio/server";

export interface ConnectionStatus {
  configured: boolean;
  message: string | null;
}

export default async function checkConnection(): Promise<ConnectionStatus> {
  try {
    const token = await getWorkspaceSetting("ringee_token");
    if (typeof token !== "string" || token.length === 0) {
      return {
        configured: false,
        message:
          "Ringee integration token is not configured. Go to Workspace Settings to set it up.",
      };
    }
    return { configured: true, message: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check connection";
    console.error(`[checkConnection] ${message}`);
    return { configured: false, message };
  }
}
